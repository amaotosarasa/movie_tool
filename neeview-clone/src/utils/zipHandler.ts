import AdmZip from 'adm-zip'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { ZipFileInfo, ZipInfo, ZipScanOptions, ZipError, ZipErrorType } from '../types/electron.d'
import { ZipBombDetector, FileNameHandler, DEFAULT_SECURITY_POLICY } from './zipSecurity'

export class ZipHandler {
  private static readonly SUPPORTED_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
  private static readonly SUPPORTED_VIDEO_EXTS = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm']
  private static readonly MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB (高画質ファイル対応)

  // デコード済みパス → 元エントリ名のマッピングキャッシュ
  private static pathMappingCache = new Map<string, Map<string, string>>()

  // 一時ファイル管理
  private static tempFileCache = new Map<string, string>() // {zipPath}::{internalPath} -> tempFilePath
  private static readonly TEMP_DIR = path.join(os.tmpdir(), 'neeview-zip-temp')

  /**
   * ZIP内のメディアファイル一覧を取得
   */
  async listMediaFiles(zipPath: string, options?: ZipScanOptions): Promise<ZipFileInfo[]> {
    try {
      // ZIPファイルの存在確認
      if (!fs.existsSync(zipPath)) {
        throw this.createError(ZipErrorType.CORRUPTED_ARCHIVE, `ファイルが存在しません: ${zipPath}`)
      }

      // ZIPファイルを開く
      const zip = new AdmZip(zipPath)
      const entries = zip.getEntries()

      if (entries.length === 0) {
        return []
      }

      // セキュリティ検証
      const securityCheck = ZipBombDetector.detectZipBomb(entries)
      if (securityCheck.isBlocked) {
        throw this.createError(ZipErrorType.ZIP_BOMB_DETECTED, {
          reasons: securityCheck.reasons,
          statistics: securityCheck.statistics
        })
      }

      // メディアファイルをフィルター
      const mediaFiles = this.filterMediaFiles(entries, zipPath, options)

      // ソート処理
      if (options?.sortBy) {
        this.sortFiles(mediaFiles, options.sortBy, options.sortOrder || 'asc')
      }

      return mediaFiles
    } catch (error) {
      if (error instanceof Error && 'type' in error) {
        throw error // 既にZipErrorの場合はそのまま投げる
      }
      throw this.createError(ZipErrorType.CORRUPTED_ARCHIVE, error.message)
    }
  }

  /**
   * ZIP内のファイルを一時ファイルとして抽出（file://プロトコル用）
   */
  async extractToTempFile(zipPath: string, internalPath: string): Promise<string> {
    // キャッシュキー作成
    const cacheKey = `${zipPath}::${internalPath}`

    // 既に一時ファイルが存在する場合はそのパスを返す
    if (ZipHandler.tempFileCache.has(cacheKey)) {
      const tempPath = ZipHandler.tempFileCache.get(cacheKey)!
      if (fs.existsSync(tempPath)) {
        return tempPath
      } else {
        // 一時ファイルが削除されている場合はキャッシュをクリア
        ZipHandler.tempFileCache.delete(cacheKey)
      }
    }

    try {
      // 一時ディレクトリを作成
      if (!fs.existsSync(ZipHandler.TEMP_DIR)) {
        fs.mkdirSync(ZipHandler.TEMP_DIR, { recursive: true })
      }

      // ファイルを抽出
      const buffer = await this.extractFile(zipPath, internalPath)

      // 一時ファイルパスを生成（拡張子を保持）
      const ext = path.extname(internalPath) || '.tmp'
      const tempFileName = `zip_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`
      const tempPath = path.join(ZipHandler.TEMP_DIR, tempFileName)

      // 一時ファイルに書き込み
      fs.writeFileSync(tempPath, buffer)

      // キャッシュに追加
      ZipHandler.tempFileCache.set(cacheKey, tempPath)

      return tempPath
    } catch (error) {
      throw error
    }
  }

  /**
   * ZIP内の特定ファイルを抽出
   */
  async extractFile(zipPath: string, internalPath: string): Promise<Buffer> {
    try {
      const zip = new AdmZip(zipPath)
      const allEntries = zip.getEntries()

      // まずデコード済みパスで検索
      let entry = zip.getEntry(internalPath)

      // 見つからない場合、マッピングキャッシュから元のエントリ名を取得
      if (!entry) {
        const zipMapping = ZipHandler.pathMappingCache.get(zipPath)
        if (zipMapping && zipMapping.has(internalPath)) {
          const originalEntryName = zipMapping.get(internalPath)!
          entry = zip.getEntry(originalEntryName)
        }
      }

      // それでも見つからない場合、全エントリを検索（フォールバック）
      if (!entry) {
        for (const e of allEntries) {
          const decodedPath = FileNameHandler.decodeZipFileName(e)
          if (decodedPath === internalPath) {
            entry = e
            break
          }
        }
      }

      if (!entry) {
        throw this.createError(ZipErrorType.CORRUPTED_ARCHIVE, `ファイルが見つかりません: ${internalPath}`)
      }

      // サイズチェック
      if (entry.header.size > ZipHandler.MAX_FILE_SIZE) {
        throw this.createError(ZipErrorType.FILE_TOO_LARGE, {
          fileSize: entry.header.size,
          maxSize: ZipHandler.MAX_FILE_SIZE,
          fileName: internalPath
        })
      }

      // セキュリティ検証
      const validation = ZipBombDetector.validateEntry(entry)
      if (!validation.valid) {
        throw this.createError(ZipErrorType.ZIP_BOMB_DETECTED, {
          fileName: internalPath,
          issues: validation.issues,
          severity: validation.severity
        })
      }

      // ファイル抽出
      const buffer = zip.readFile(entry)
      if (!buffer) {
        throw this.createError(ZipErrorType.CORRUPTED_ARCHIVE, `ファイル読み込みに失敗: ${internalPath}`)
      }

      return buffer
    } catch (error) {
      if (error instanceof Error && 'type' in error) {
        throw error
      }
      throw this.createError(ZipErrorType.CORRUPTED_ARCHIVE, error.message)
    }
  }

  /**
   * ZIPファイルの妥当性検証
   */
  async validateZip(zipPath: string): Promise<ZipInfo> {
    try {
      const stats = fs.statSync(zipPath)
      const zip = new AdmZip(zipPath)
      const entries = zip.getEntries()

      // セキュリティチェック
      const securityCheck = ZipBombDetector.detectZipBomb(entries)

      // 基本情報を収集
      let mediaFileCount = 0
      let hasNestedFolders = false
      let totalUncompressedSize = 0
      let totalCompressedSize = 0
      let maxDepth = 0

      for (const entry of entries) {
        // メディアファイル判定
        if (this.isMediaFile(entry.entryName)) {
          mediaFileCount++
        }

        // ネストチェック
        const depth = entry.entryName.split('/').length - 1
        maxDepth = Math.max(maxDepth, depth)
        if (depth > 1) {
          hasNestedFolders = true
        }

        // サイズ情報
        totalUncompressedSize += entry.header.size
        totalCompressedSize += entry.header.compressedSize
      }

      const zipInfo: ZipInfo = {
        path: zipPath,
        fileCount: entries.length,
        totalSize: stats.size,
        mediaFileCount,
        hasNestedFolders,
        encoding: 'utf8', // 簡易実装：実際にはファイル名から推定
        compressionMethod: 'deflate', // 簡易実装：実際にはZIPから取得
        createdAt: stats.mtime,
        averageCompressionRatio: totalCompressedSize > 0 ? totalUncompressedSize / totalCompressedSize : 0,
        suspiciousFiles: securityCheck.isSuspicious ? 1 : 0
      }

      return zipInfo
    } catch (error) {
      throw this.createError(ZipErrorType.CORRUPTED_ARCHIVE, error.message)
    }
  }

  /**
   * メディアファイルをフィルター
   */
  private filterMediaFiles(entries: AdmZip.IZipEntry[], zipPath: string, options?: ZipScanOptions): ZipFileInfo[] {
    const mediaFiles: ZipFileInfo[] = []

    for (const entry of entries) {
      // ディレクトリは除外
      if (entry.isDirectory) continue

      // メディアファイル判定
      const mediaType = this.isMediaFile(entry.entryName)
      if (!mediaType) continue

      // ファイルサイズ制限チェック
      if (options?.maxFileSize && entry.header.size > options.maxFileSize) {
        continue
      }

      // ファイル名処理：文字化けを修復しようとせず、直接使用可能な名前を生成
      const decodedPath = FileNameHandler.decodeZipFileName(entry)

      // 実用的なアプローチ：文字化けファイル名から意味のある名前を生成
      const meaningfulPath = FileNameHandler.generateMeaningfulFileName(entry.entryName)
      const normalizedPath = FileNameHandler.sanitizeFileName(meaningfulPath)
      const compressionRatio = entry.header.compressedSize > 0
        ? entry.header.size / entry.header.compressedSize
        : 0

      // マッピングキャッシュを更新：意味のある名前 -> 元のエントリ名
      if (!ZipHandler.pathMappingCache.has(zipPath)) {
        ZipHandler.pathMappingCache.set(zipPath, new Map<string, string>())
      }
      const zipMapping = ZipHandler.pathMappingCache.get(zipPath)!
      // 意味のある名前をキーとして、元のエントリ名をマッピング
      zipMapping.set(meaningfulPath, entry.entryName)

      // ZipFileInfo作成
      // pathプロパティは一意識別子として使用するが、URL形式ではない形にする
      const zipFileInfo: ZipFileInfo = {
        path: `[ZIP]${path.basename(zipPath)}/${meaningfulPath}`, // 表示用・識別用パス（意味のある名前使用）
        name: path.basename(meaningfulPath),
        type: mediaType,
        size: entry.header.size,
        modified: entry.header.time.getTime(),
        zipPath,
        internalPath: meaningfulPath, // 意味のある名前を使用（マッピングキーと一致）
        isZipContent: true,
        encodedPath: normalizedPath,
        compressionRatio,
        depth: meaningfulPath.split('/').length - 1,
        originalEntryName: entry.entryName // 元のエントリ名を保持
      }

      mediaFiles.push(zipFileInfo)
    }

    return mediaFiles
  }

  /**
   * ファイル種別判定
   */
  private isMediaFile(filename: string): 'image' | 'video' | null {
    const ext = path.extname(filename).toLowerCase().slice(1)

    if (ZipHandler.SUPPORTED_IMAGE_EXTS.includes(ext)) {
      return 'image'
    }

    if (ZipHandler.SUPPORTED_VIDEO_EXTS.includes(ext)) {
      return 'video'
    }

    return null
  }

  /**
   * ファイルソート
   */
  private sortFiles(files: ZipFileInfo[], sortBy: 'name' | 'date' | 'size' | 'type', sortOrder: 'asc' | 'desc'): void {
    files.sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'ja', { numeric: true })
          break
        case 'date':
          comparison = a.modified - b.modified
          break
        case 'size':
          comparison = a.size - b.size
          break
        case 'type':
          comparison = a.type.localeCompare(b.type)
          break
        default:
          comparison = 0
      }

      return sortOrder === 'desc' ? -comparison : comparison
    })
  }

  /**
   * ZipError作成ヘルパー
   */
  private createError(type: ZipErrorType, details?: any): ZipError {
    const errorMessages = {
      [ZipErrorType.CORRUPTED_ARCHIVE]: 'ZIPファイルが破損しているか、読み込みに失敗しました。',
      [ZipErrorType.FILE_TOO_LARGE]: 'ファイルサイズが制限を超えています。',
      [ZipErrorType.ZIP_BOMB_DETECTED]: 'このZIPファイルは安全上の理由により処理できません。',
      [ZipErrorType.ENCODING_ERROR]: 'ファイル名のエンコーディングに問題があります。',
      [ZipErrorType.MEMORY_INSUFFICIENT]: 'メモリが不足しています。',
      [ZipErrorType.DISK_SPACE_INSUFFICIENT]: 'ディスク容量が不足しています。',
      [ZipErrorType.PERMISSION_DENIED]: 'ファイルアクセス権限がありません。',
      [ZipErrorType.UNSUPPORTED_COMPRESSION]: 'サポートされていない圧縮方式です。',
      [ZipErrorType.PASSWORD_REQUIRED]: 'パスワードが必要です。',
      [ZipErrorType.CONCURRENT_LIMIT_EXCEEDED]: '同時処理数の制限を超えています。'
    }

    const error = new Error(typeof details === 'string' ? details : JSON.stringify(details)) as ZipError
    error.type = type
    error.userMessage = errorMessages[type]
    error.technicalDetails = details
    error.name = 'ZipError'

    return error
  }
}