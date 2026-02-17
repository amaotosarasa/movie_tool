export type ViewMode = 'single' | 'spread'
export type BindingDirection = 'right-to-left' | 'left-to-right'


export interface MediaFileInfo {
  path: string
  name: string
  type: 'image' | 'video' | 'unknown'
  size: number
  modified: number
}

export interface ScanOptions {
  includeSubfolders?: boolean
  sortBy?: 'name' | 'date' | 'size' | 'type'
  sortOrder?: 'asc' | 'desc'
  fileTypes?: string[]
}

// ZIP関連型定義（Phase 1）
export interface ZipFileInfo extends MediaFileInfo {
  zipPath: string
  internalPath: string
  isZipContent: boolean
  encodedPath?: string        // エンコーディング対応
  extractionTime?: number     // 抽出時間記録
  compressionRatio: number    // 圧縮比
  depth: number               // ディレクトリ階層数
}

export interface ZipInfo {
  path: string
  fileCount: number
  totalSize: number
  mediaFileCount: number
  hasNestedFolders: boolean
  encoding: string            // 文字エンコーディング
  compressionMethod: string
  createdAt: Date
  averageCompressionRatio: number
  suspiciousFiles: number     // セキュリティ警告ファイル数
}

export interface ZipScanOptions extends ScanOptions {
  validateZip?: boolean
  maxFileSize?: number
  encoding?: string           // 'auto' | 'utf8' | 'shift_jis'
  showProgress?: boolean
  progressCallback?: (progress: number, current: string) => void
  signal?: AbortSignal        // キャンセル対応
}

// プログレス管理
export interface ZipProgressInfo {
  phase: 'scanning' | 'filtering' | 'validating' | 'extracting'
  current: number
  total: number
  currentFile: string
  eta: number                 // 予想残り時間（秒）
}

// エラー分類
export enum ZipErrorType {
  CORRUPTED_ARCHIVE = 'CORRUPTED_ARCHIVE',
  UNSUPPORTED_COMPRESSION = 'UNSUPPORTED_COMPRESSION',
  PASSWORD_REQUIRED = 'PASSWORD_REQUIRED',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  MEMORY_INSUFFICIENT = 'MEMORY_INSUFFICIENT',
  DISK_SPACE_INSUFFICIENT = 'DISK_SPACE_INSUFFICIENT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ENCODING_ERROR = 'ENCODING_ERROR',
  ZIP_BOMB_DETECTED = 'ZIP_BOMB_DETECTED',
  CONCURRENT_LIMIT_EXCEEDED = 'CONCURRENT_LIMIT_EXCEEDED'
}

export interface ZipError extends Error {
  type: ZipErrorType
  zipPath?: string
  internalPath?: string
  userMessage: string         // ユーザー向けメッセージ
  technicalDetails?: any      // 技術者向け詳細
}

export interface IAPI {
  // File operations
  openFile: () => Promise<string | null>
  openDirectory: () => Promise<string | null>
  scanFolder: (folderPath: string, options?: ScanOptions) => Promise<MediaFileInfo[]>

  // Window controls
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void

  // Fullscreen controls
  toggleFullscreen: () => Promise<boolean>
  exitFullscreen: () => Promise<boolean>
  getFullscreenState: () => Promise<boolean>

  // ZIP関連API（Phase 1）
  scanZip: (
    zipPath: string,
    options?: ZipScanOptions
  ) => Promise<{ files: ZipFileInfo[], info: ZipInfo }>
  extractZipFile: (
    zipPath: string,
    internalPath: string,
    options?: { priority?: 'high' | 'normal' }
  ) => Promise<string>
  validateZip: (zipPath: string) => Promise<ZipInfo>
  cleanupZipTemp: (zipPath?: string) => Promise<{ cleaned: number, errors: string[] }>
  cancelZipOperation: (operationId: string) => Promise<boolean>
  getZipOperationProgress: (operationId: string) => Promise<ZipProgressInfo | null>
  preloadZipFiles: (zipPath: string, filePaths: string[]) => Promise<void>
  optimizeZipCache: () => Promise<{ freed: number, remaining: number }>

  // System info
  platform: NodeJS.Platform
  versions: {
    node: string
    chrome: string
    electron: string
  }
}

declare global {
  interface Window {
    electron: IElectronAPI
    api: IAPI
  }
}