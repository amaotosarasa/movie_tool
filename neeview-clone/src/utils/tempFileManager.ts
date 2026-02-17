import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as crypto from 'crypto'

interface TempFileInfo {
  path: string
  created: Date
  size: number
  accessed: Date
  zipSource: string
}

export class TempFileManager {
  private static readonly TEMP_DIR = path.join(os.tmpdir(), 'neeview-zip-temp')
  private static readonly CLEANUP_INTERVAL = 60 * 60 * 1000 // 1時間
  private static readonly MAX_TEMP_SIZE = 200 * 1024 * 1024  // 200MB
  private static readonly MAX_FILE_AGE = 24 * 60 * 60 * 1000 // 24時間

  private static tempFiles = new Map<string, TempFileInfo>()
  private static cleanupTimer: NodeJS.Timeout | null = null
  private static initialized = false

  /**
   * 初期化
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // 一時ディレクトリの作成
      await this.ensureTempDirectory()

      // 既存の一時ファイルの検出と登録
      await this.discoverExistingTempFiles()

      // 定期クリーンアップの開始
      this.startCleanupTimer()

      this.initialized = true
      console.log(`TempFileManager initialized. Temp dir: ${this.TEMP_DIR}`)
    } catch (error) {
      console.error('Failed to initialize TempFileManager:', error)
      throw error
    }
  }

  /**
   * 一時ファイル名の生成（セキュア）
   */
  static generateTempFileName(zipPath: string, internalPath: string): string {
    // セキュアなランダムバイト生成
    const randomBytes = crypto.randomBytes(8).toString('hex')
    const timestamp = Date.now().toString()

    // 予測困難なハッシュ生成
    const hash = crypto.createHash('sha256')
      .update(`${zipPath}::${internalPath}::${timestamp}::${randomBytes}`)
      .digest('hex')
      .substring(0, 16)

    const ext = path.extname(internalPath)
    return `nv_${hash}${ext}`
  }

  /**
   * 一時ファイルの保存
   */
  static async saveTempFile(
    buffer: Buffer,
    originalPath: string,
    zipSource: string
  ): Promise<string> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      // ディスク容量チェック
      await this.ensureDiskSpace(buffer.length)

      // 一時ファイル名生成
      const tempFileName = this.generateTempFileName(zipSource, originalPath)
      const tempFilePath = path.join(this.TEMP_DIR, tempFileName)

      // ファイル書き込み（原子的操作・セキュアな権限設定）
      const tempFileTmp = tempFilePath + '.tmp'

      // セキュアな権限でファイル作成（ユーザーのみ読み書き可能）
      await fs.promises.writeFile(tempFileTmp, buffer, {
        mode: 0o600, // rw-------
        flag: 'w'
      })

      await fs.promises.rename(tempFileTmp, tempFilePath)

      // 最終ファイルの権限も確実に設定
      await fs.promises.chmod(tempFilePath, 0o600)

      // メタデータ登録
      const tempFileInfo: TempFileInfo = {
        path: tempFilePath,
        created: new Date(),
        size: buffer.length,
        accessed: new Date(),
        zipSource
      }

      this.tempFiles.set(tempFilePath, tempFileInfo)

      console.log(`Temp file created: ${tempFileName} (${buffer.length} bytes)`)
      return tempFilePath

    } catch (error) {
      console.error('Failed to save temp file:', error)
      throw new Error(`一時ファイルの保存に失敗しました: ${error.message}`)
    }
  }

  /**
   * 一時ファイルのアクセス記録更新
   */
  static updateAccess(tempFilePath: string): void {
    const fileInfo = this.tempFiles.get(tempFilePath)
    if (fileInfo) {
      fileInfo.accessed = new Date()
    }
  }

  /**
   * 特定ZIPの一時ファイルをクリーンアップ
   */
  static async cleanupZip(zipPath: string): Promise<{ cleaned: number, errors: string[] }> {
    const errors: string[] = []
    let cleaned = 0

    const filesToClean: string[] = []

    // 対象ファイルを特定
    for (const [filePath, fileInfo] of this.tempFiles) {
      if (fileInfo.zipSource === zipPath) {
        filesToClean.push(filePath)
      }
    }

    // ファイル削除
    for (const filePath of filesToClean) {
      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath)
        }
        this.tempFiles.delete(filePath)
        cleaned++
      } catch (error) {
        errors.push(`Failed to delete ${filePath}: ${error.message}`)
      }
    }

    console.log(`Cleaned up ${cleaned} temp files for ${path.basename(zipPath)}`)
    return { cleaned, errors }
  }

  /**
   * 全ての一時ファイルをクリーンアップ
   */
  static async cleanupAll(): Promise<{ cleaned: number, errors: string[] }> {
    const errors: string[] = []
    let cleaned = 0

    const allFiles = Array.from(this.tempFiles.keys())

    for (const filePath of allFiles) {
      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath)
        }
        this.tempFiles.delete(filePath)
        cleaned++
      } catch (error) {
        errors.push(`Failed to delete ${filePath}: ${error.message}`)
      }
    }

    console.log(`Cleaned up all ${cleaned} temp files`)
    return { cleaned, errors }
  }

  /**
   * 古い一時ファイルのクリーンアップ
   */
  static async cleanupOldFiles(): Promise<{ cleaned: number, errors: string[] }> {
    const errors: string[] = []
    let cleaned = 0
    const now = Date.now()

    const filesToClean: string[] = []

    // 古いファイルを特定
    for (const [filePath, fileInfo] of this.tempFiles) {
      const fileAge = now - fileInfo.accessed.getTime()
      if (fileAge > this.MAX_FILE_AGE) {
        filesToClean.push(filePath)
      }
    }

    // ファイル削除
    for (const filePath of filesToClean) {
      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath)
        }
        this.tempFiles.delete(filePath)
        cleaned++
      } catch (error) {
        errors.push(`Failed to delete old file ${filePath}: ${error.message}`)
      }
    }

    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} old temp files`)
    }

    return { cleaned, errors }
  }

  /**
   * 一時ディレクトリの統計情報取得
   */
  static getTempDirectoryStats(): {
    fileCount: number
    totalSize: number
    oldestFile: Date | null
    largestFile: { path: string, size: number } | null
  } {
    let totalSize = 0
    let oldestFile: Date | null = null
    let largestFile: { path: string, size: number } | null = null

    for (const [filePath, fileInfo] of this.tempFiles) {
      totalSize += fileInfo.size

      if (!oldestFile || fileInfo.created < oldestFile) {
        oldestFile = fileInfo.created
      }

      if (!largestFile || fileInfo.size > largestFile.size) {
        largestFile = { path: filePath, size: fileInfo.size }
      }
    }

    return {
      fileCount: this.tempFiles.size,
      totalSize,
      oldestFile,
      largestFile
    }
  }

  /**
   * 定期クリーンアップの開始
   */
  static startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }

    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupOldFiles()
        await this.ensureDiskSpace(0) // サイズ制限チェック
      } catch (error) {
        console.error('Cleanup timer error:', error)
      }
    }, this.CLEANUP_INTERVAL)
  }

  /**
   * 定期クリーンアップの停止
   */
  static stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  /**
   * 一時ディレクトリの確認・作成（セキュアな権限設定）
   */
  private static async ensureTempDirectory(): Promise<void> {
    try {
      await fs.promises.access(this.TEMP_DIR)
    } catch {
      // ディレクトリをセキュアな権限で作成（ユーザーのみアクセス可能）
      await fs.promises.mkdir(this.TEMP_DIR, {
        recursive: true,
        mode: 0o700 // rwx------
      })
    }

    // 既存ディレクトリの権限も確実に設定
    await fs.promises.chmod(this.TEMP_DIR, 0o700)
  }

  /**
   * 既存の一時ファイルの検出
   */
  private static async discoverExistingTempFiles(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.TEMP_DIR)

      for (const fileName of files) {
        if (fileName.startsWith('nv_') && fileName.includes('.')) {
          const filePath = path.join(this.TEMP_DIR, fileName)
          try {
            const stats = await fs.promises.stat(filePath)

            // 孤児ファイル（24時間以上古い）は削除
            const fileAge = Date.now() - stats.mtime.getTime()
            if (fileAge > this.MAX_FILE_AGE) {
              await fs.promises.unlink(filePath)
              console.log(`Removed orphaned temp file: ${fileName}`)
            } else {
              // メタデータ登録（推定）
              const tempFileInfo: TempFileInfo = {
                path: filePath,
                created: stats.ctime,
                size: stats.size,
                accessed: stats.atime,
                zipSource: 'unknown' // 再起動後は不明
              }
              this.tempFiles.set(filePath, tempFileInfo)
            }
          } catch (error) {
            console.warn(`Failed to process existing temp file ${fileName}:`, error)
          }
        }
      }
    } catch (error) {
      console.warn('Failed to discover existing temp files:', error)
    }
  }

  /**
   * ディスク容量の確保
   */
  private static async ensureDiskSpace(requiredSize: number): Promise<void> {
    const stats = this.getTempDirectoryStats()
    const projectedSize = stats.totalSize + requiredSize

    if (projectedSize > this.MAX_TEMP_SIZE) {
      // LRUによる古いファイルの削除
      const filesToDelete = Array.from(this.tempFiles.entries())
        .sort(([, a], [, b]) => a.accessed.getTime() - b.accessed.getTime())

      let freedSize = 0
      const targetFreeSize = projectedSize - this.MAX_TEMP_SIZE + (this.MAX_TEMP_SIZE * 0.1) // 10%のマージン

      for (const [filePath, fileInfo] of filesToDelete) {
        try {
          if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath)
            freedSize += fileInfo.size
          }
          this.tempFiles.delete(filePath)

          if (freedSize >= targetFreeSize) {
            break
          }
        } catch (error) {
          console.warn(`Failed to delete temp file for space: ${filePath}`, error)
        }
      }

      console.log(`Freed ${Math.round(freedSize / 1024 / 1024)}MB of temp space`)
    }
  }

  /**
   * シャットダウン処理
   */
  static async shutdown(): Promise<void> {
    this.stopCleanupTimer()
    // 必要に応じてクリーンアップ（開発モードでは保持することも）
    console.log('TempFileManager shutdown')
  }
}