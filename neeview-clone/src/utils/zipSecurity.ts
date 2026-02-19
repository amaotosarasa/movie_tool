import * as AdmZip from 'adm-zip'
import * as path from 'path'
import * as iconv from 'iconv-lite'

// ZIP Bomb対策クラス
export class ZipBombDetector {
  private static readonly MAX_COMPRESSION_RATIO = 100      // 圧縮比制限
  private static readonly MAX_NESTED_DEPTH = 10            // ネスト階層制限
  private static readonly MAX_TOTAL_EXTRACTED_SIZE = 1024 * 1024 * 1024 // 1GB
  private static readonly MAX_FILE_COUNT = 10000           // ファイル数制限
  private static readonly SUSPICIOUS_RATIO_THRESHOLD = 500 // 要注意レベル

  static detectZipBomb(entries: AdmZip.IZipEntry[]): {
    isSuspicious: boolean
    isBlocked: boolean
    reasons: string[]
    statistics: {
      totalFiles: number
      totalCompressedSize: number
      totalUncompressedSize: number
      averageRatio: number
      maxDepth: number
    }
  } {
    const reasons: string[] = []
    let totalCompressedSize = 0
    let totalUncompressedSize = 0
    let maxDepth = 0
    let suspiciousFileCount = 0
    let blockedFileCount = 0

    // 各エントリを検証
    for (const entry of entries) {
      totalCompressedSize += entry.header.compressedSize
      totalUncompressedSize += entry.header.size

      // ディレクトリ階層の深さを計算
      const depth = entry.entryName.split('/').length - 1
      maxDepth = Math.max(maxDepth, depth)

      // 個別ファイルの検証
      const validation = this.validateEntry(entry)
      if (validation.severity === 'critical') {
        blockedFileCount++
        reasons.push(`危険なファイル: ${entry.entryName} (${validation.issues.join(', ')})`)
      } else if (validation.severity === 'high') {
        suspiciousFileCount++
        reasons.push(`疑わしいファイル: ${entry.entryName} (${validation.issues.join(', ')})`)
      }
    }

    // 統計情報
    const statistics = {
      totalFiles: entries.length,
      totalCompressedSize,
      totalUncompressedSize,
      averageRatio: totalCompressedSize > 0 ? totalUncompressedSize / totalCompressedSize : 0,
      maxDepth
    }

    // 全体的な検証
    if (entries.length > this.MAX_FILE_COUNT) {
      reasons.push(`ファイル数が制限を超過 (${entries.length} > ${this.MAX_FILE_COUNT})`)
      blockedFileCount++
    }

    if (statistics.averageRatio > this.MAX_COMPRESSION_RATIO) {
      reasons.push(`平均圧縮比が制限を超過 (${statistics.averageRatio.toFixed(1)} > ${this.MAX_COMPRESSION_RATIO})`)
      blockedFileCount++
    }

    if (totalUncompressedSize > this.MAX_TOTAL_EXTRACTED_SIZE) {
      reasons.push(`展開後サイズが制限を超過 (${Math.round(totalUncompressedSize / 1024 / 1024)}MB > ${this.MAX_TOTAL_EXTRACTED_SIZE / 1024 / 1024}MB)`)
      blockedFileCount++
    }

    if (maxDepth > this.MAX_NESTED_DEPTH) {
      reasons.push(`ディレクトリ階層が制限を超過 (${maxDepth} > ${this.MAX_NESTED_DEPTH})`)
      suspiciousFileCount++
    }

    return {
      isSuspicious: suspiciousFileCount > 0 || statistics.averageRatio > this.SUSPICIOUS_RATIO_THRESHOLD,
      isBlocked: blockedFileCount > 0,
      reasons,
      statistics
    }
  }

  static validateEntry(entry: AdmZip.IZipEntry): {
    valid: boolean
    issues: string[]
    severity: 'low' | 'medium' | 'high' | 'critical'
  } {
    const issues: string[] = []
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'

    // ファイルサイズチェック
    if (entry.header.size > 500 * 1024 * 1024) { // 500MB
      issues.push('ファイルサイズが制限を超過')
      severity = 'critical'
    }

    // 圧縮比チェック
    const compressionRatio = entry.header.compressedSize > 0
      ? entry.header.size / entry.header.compressedSize
      : 0

    if (compressionRatio > this.MAX_COMPRESSION_RATIO) {
      issues.push(`圧縮比が異常 (${compressionRatio.toFixed(1)}倍)`)
      severity = 'critical'
    } else if (compressionRatio > this.SUSPICIOUS_RATIO_THRESHOLD) {
      issues.push(`圧縮比が要注意レベル (${compressionRatio.toFixed(1)}倍)`)
      severity = severity === 'critical' ? 'critical' : 'high'
    }

    // パス検証
    const pathValidation = FileNameHandler.sanitizeFileName(entry.entryName)
    if (pathValidation !== entry.entryName) {
      issues.push('ファイルパスに問題あり')
      severity = severity === 'critical' ? 'critical' : 'high'
    }

    // ファイル名長さチェック
    if (entry.entryName.length > 255) {
      issues.push('ファイル名が長すぎます')
      severity = severity === 'critical' ? 'critical' : 'medium'
    }

    return {
      valid: severity !== 'critical',
      issues,
      severity
    }
  }
}

// ファイル名処理クラス
export class FileNameHandler {
  static readonly FORBIDDEN_CHARS = /[<>:"|?*\x00-\x1f]/g
  static readonly MAX_FILENAME_LENGTH = 255
  static readonly RESERVED_NAMES = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']

  static detectEncoding(fileName: Buffer): string {
    // 簡易エンコーディング検出
    // UTF-8 BOMをチェック
    if (fileName.length >= 3 && fileName[0] === 0xEF && fileName[1] === 0xBB && fileName[2] === 0xBF) {
      return 'utf8'
    }

    // ASCII範囲かチェック
    let isAscii = true
    let hasHighBytes = false
    for (let i = 0; i < fileName.length; i++) {
      const byte = fileName[i]
      if (byte > 127) {
        isAscii = false
        hasHighBytes = true
      }
      if (byte === 0) break // null終端
    }

    if (isAscii) return 'ascii'
    if (hasHighBytes) {
      // 日本語文字の可能性をチェック（簡易判定）
      // Shift_JISの可能性が高い範囲をチェック
      for (let i = 0; i < fileName.length - 1; i++) {
        const byte1 = fileName[i]
        const byte2 = fileName[i + 1]
        if ((byte1 >= 0x81 && byte1 <= 0x9F) || (byte1 >= 0xE0 && byte1 <= 0xFC)) {
          if (byte2 >= 0x40 && byte2 <= 0xFC && byte2 !== 0x7F) {
            return 'shift_jis'
          }
        }
      }
      return 'utf8' // デフォルトでUTF-8と判定
    }

    return 'ascii'
  }

  /**
   * ZIP entryからファイル名を適切にデコード
   * 実用的なアプローチ：文字化けしたファイル名は意味のある名前に変換する
   */
  static decodeZipFileName(entry: AdmZip.IZipEntry): string {
    try {
      const rawName = entry.entryName

      // 文字化けしているかチェック
      if (this.hasGarbledCharacters(rawName)) {
        // 実用的な解決策：ファイルの位置と拡張子からユーザーフレンドリーな名前を生成
        return this.generateMeaningfulFileName(rawName)
      }

      // 文字化けしていない場合はそのまま使用
      return rawName
    } catch (error) {
      console.error('ZIP filename decoding error:', error)
      return this.generateMeaningfulFileName(entry.entryName || 'unknown_file')
    }
  }

  /**
   * 意味のあるファイル名を生成（文字化けファイル用）
   * 外部からアクセス可能にするため public に変更
   */
  static generateMeaningfulFileName(garbledName: string): string {
    // ファイル拡張子を抽出
    const extMatch = garbledName.match(/\.(jpg|jpeg|png|gif|bmp|webp|mp4|avi|mkv|mov)$/i)
    const ext = extMatch ? extMatch[0] : '.jpg'

    // 数字部分を抽出（ページ番号として使用）
    const numberMatches = garbledName.match(/\d+/g)
    let pageNumber = '001'

    if (numberMatches) {
      // 最も長い数字列を選択（通常はページ番号）
      const longestNumber = numberMatches.reduce((a, b) => a.length >= b.length ? a : b)
      pageNumber = longestNumber.padStart(3, '0')
    } else {
      // 数字が見つからない場合、ファイル名のハッシュから生成
      let hash = 0
      for (let i = 0; i < garbledName.length; i++) {
        hash = ((hash << 5) - hash + garbledName.charCodeAt(i)) & 0xffffffff
      }
      pageNumber = Math.abs(hash % 999).toString().padStart(3, '0')
    }

    // ディレクトリ構造を完全に削除し、フラットなファイル名にする
    // 文字化けしたディレクトリ名を避けるため、ファイル名のみを使用
    return `page_${pageNumber}${ext}`
  }

  /**
   * 文字化けしているかチェック
   */
  private static hasGarbledCharacters(str: string): boolean {
    // 制御文字や置換文字（�）の存在をチェック
    return /[\uFFFD\u0000-\u0008\u000E-\u001F\u007F]/.test(str) ||
           // 連続する非ASCII文字が異常に多い場合
           (str.match(/[^\x00-\x7F]/g) || []).length > str.length * 0.7
  }

  /**
   * デコード結果が有効かチェック
   */
  private static isValidDecodedString(str: string): boolean {
    // 置換文字（�）がない、かつ制御文字が少ない
    return !str.includes('�') &&
           !/[\u0000-\u0008\u000E-\u001F\u007F]/.test(str) &&
           str.trim().length > 0
  }

  static normalizeFileName(fileName: string, encoding?: string): string {
    let normalized = fileName

    // エンコーディング変換（必要に応じて）
    if (encoding === 'shift_jis') {
      // Shift_JISからUTF-8への変換ロジック（簡易版）
      // 実際の実装では適切なライブラリを使用
      normalized = fileName
    }

    // パス正規化
    normalized = path.normalize(normalized)

    // 制御文字と禁止文字の除去
    normalized = normalized.replace(this.FORBIDDEN_CHARS, '_')

    // 先頭・末尾の空白除去
    normalized = normalized.trim()

    // 長さ制限
    if (normalized.length > this.MAX_FILENAME_LENGTH) {
      const ext = path.extname(normalized)
      const baseName = path.basename(normalized, ext)
      const maxBaseLength = this.MAX_FILENAME_LENGTH - ext.length
      normalized = baseName.substring(0, maxBaseLength) + ext
    }

    // 予約名チェック
    const baseName = path.basename(normalized, path.extname(normalized)).toUpperCase()
    if (this.RESERVED_NAMES.includes(baseName)) {
      normalized = '_' + normalized
    }

    return normalized
  }

  static sanitizeFileName(fileName: string): string {
    let sanitized = fileName

    // パストラバーサル対策
    sanitized = sanitized.replace(/\.\./g, '__')
    sanitized = sanitized.replace(/^\/+/, '') // 先頭のスラッシュ除去
    sanitized = sanitized.replace(/^[a-zA-Z]:/, '') // Windowsドライブレター除去

    // 絶対パスの除去
    if (path.isAbsolute(sanitized)) {
      sanitized = path.relative('/', sanitized)
    }

    // 正規化
    return this.normalizeFileName(sanitized)
  }
}

// セキュリティポリシー
export interface SecurityPolicy {
  maxFileSize: number                    // 500MB
  maxZipSize: number                     // 2GB
  maxCompressionRatio: number            // 100
  maxNestingDepth: number                // 10
  maxFileCount: number                   // 10000
  allowedExtensions: string[]
  blockedExtensions: string[]            // .exe, .bat, .scr など
  quarantineEnabled: boolean             // 疑わしいファイルの隔離
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  maxFileSize: 500 * 1024 * 1024,        // 500MB
  maxZipSize: 2 * 1024 * 1024 * 1024,    // 2GB
  maxCompressionRatio: 100,
  maxNestingDepth: 10,
  maxFileCount: 10000,
  allowedExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'],
  blockedExtensions: ['exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'js', 'jar', 'msi'],
  quarantineEnabled: true
}