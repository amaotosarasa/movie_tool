import { contextBridge, ipcRenderer } from 'electron'

// Basic Electron API
const electronAPI = {
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    on: (channel: string, listener: (...args: any[]) => void) => ipcRenderer.on(channel, listener),
    removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
  }
}

// Custom APIs for renderer
const api = {
  // File operations
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  scanFolder: (folderPath: string, scanOptions?: any) => ipcRenderer.invoke('folder:scan', folderPath, scanOptions),

  // Window controls
  minimizeWindow: () => ipcRenderer.send('app:minimize'),
  maximizeWindow: () => ipcRenderer.send('app:maximize'),
  closeWindow: () => ipcRenderer.send('app:close'),

  // Utility functions
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
}

// Force expose APIs
try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
  console.log('APIs exposed successfully via contextBridge', { api: typeof api, openFile: typeof api.openFile })
} catch (error) {
  console.error('Failed to expose APIs:', error)

  // Fallback: try window global
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
  console.log('APIs exposed via window global as fallback')
}