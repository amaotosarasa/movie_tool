import { contextBridge, ipcRenderer } from 'electron'

// IPC channel whitelist for security
const ALLOWED_IPC_CHANNELS = [
  // Dialog channels
  'dialog:openFile',
  'dialog:openDirectory',

  // File operations
  'folder:scan',

  // Window controls
  'app:minimize',
  'app:maximize',
  'app:close',

  // Fullscreen controls
  'window:toggle-fullscreen',
  'window:exit-fullscreen',
  'window:get-fullscreen-state',

  // ZIP operations (Phase 1 prepared)
  'zip:scan',
  'zip:extractFile',
  'zip:validate',
  'zip:cleanupTemp',
  'zip:cancelOperation',
  'zip:getProgress',
  'zip:preloadFiles',
  'zip:optimizeCache'
] as const

// Channel validation helper
function validateChannel(channel: string): boolean {
  return ALLOWED_IPC_CHANNELS.includes(channel as any)
}

// Secure IPC wrapper
const secureIpcRenderer = {
  send: (channel: string, ...args: any[]) => {
    if (!validateChannel(channel)) {
      console.error(`Blocked invalid IPC send channel: ${channel}`)
      return
    }
    return ipcRenderer.send(channel, ...args)
  },

  invoke: (channel: string, ...args: any[]) => {
    if (!validateChannel(channel)) {
      console.error(`Blocked invalid IPC invoke channel: ${channel}`)
      return Promise.reject(new Error(`Invalid IPC channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  on: (channel: string, listener: (...args: any[]) => void) => {
    if (!validateChannel(channel)) {
      console.error(`Blocked invalid IPC on channel: ${channel}`)
      return
    }
    return ipcRenderer.on(channel, listener)
  },

  removeAllListeners: (channel: string) => {
    if (!validateChannel(channel)) {
      console.error(`Blocked invalid IPC removeAllListeners channel: ${channel}`)
      return
    }
    return ipcRenderer.removeAllListeners(channel)
  }
}

// Basic Electron API with security
const electronAPI = {
  ipcRenderer: secureIpcRenderer
}

// Custom APIs for renderer with memory leak prevention
const api = {
  // File operations
  openFile: () => secureIpcRenderer.invoke('dialog:openFile'),
  openDirectory: () => secureIpcRenderer.invoke('dialog:openDirectory'),
  scanFolder: (folderPath: string, scanOptions?: any) => secureIpcRenderer.invoke('folder:scan', folderPath, scanOptions),

  // Window controls
  minimizeWindow: () => secureIpcRenderer.send('app:minimize'),
  maximizeWindow: () => secureIpcRenderer.send('app:maximize'),
  closeWindow: () => secureIpcRenderer.send('app:close'),

  // Fullscreen controls
  toggleFullscreen: () => secureIpcRenderer.invoke('window:toggle-fullscreen'),
  exitFullscreen: () => secureIpcRenderer.invoke('window:exit-fullscreen'),
  getFullscreenState: () => secureIpcRenderer.invoke('window:get-fullscreen-state'),

  // ZIP operations (Phase 1 prepared - using secure IPC)
  scanZip: (zipPath: string, options?: any) => secureIpcRenderer.invoke('zip:scan', zipPath, options),
  extractZipFile: (zipPath: string, internalPath: string, options?: any) => secureIpcRenderer.invoke('zip:extractFile', zipPath, internalPath, options),
  validateZip: (zipPath: string) => secureIpcRenderer.invoke('zip:validate', zipPath),
  cleanupZipTemp: (zipPath?: string) => secureIpcRenderer.invoke('zip:cleanupTemp', zipPath),
  cancelZipOperation: (operationId: string) => secureIpcRenderer.invoke('zip:cancelOperation', operationId),
  getZipOperationProgress: (operationId: string) => secureIpcRenderer.invoke('zip:getProgress', operationId),
  preloadZipFiles: (zipPath: string, filePaths: string[]) => secureIpcRenderer.invoke('zip:preloadFiles', zipPath, filePaths),
  optimizeZipCache: () => secureIpcRenderer.invoke('zip:optimizeCache'),

  // Memory management helper
  cleanup: () => {
    // Clean up all IPC listeners to prevent memory leaks
    ALLOWED_IPC_CHANNELS.forEach(channel => {
      ipcRenderer.removeAllListeners(channel)
    })
  },

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
} catch (error) {
  console.error('Failed to expose APIs:', error)

  // Fallback: try window global
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}