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

export interface IAPI {
  // File operations
  openFile: () => Promise<string | null>
  openDirectory: () => Promise<string | null>

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