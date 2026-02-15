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