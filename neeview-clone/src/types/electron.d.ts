export interface IElectronAPI {
  ipcRenderer: {
    sendMessage: (channel: string, ...args: unknown[]) => void
    on: (
      channel: string,
      func: (...args: unknown[]) => void
    ) => (() => void) | undefined
    once: (channel: string, func: (...args: unknown[]) => void) => void
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  }
}

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