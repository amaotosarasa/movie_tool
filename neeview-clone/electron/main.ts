import { app, BrowserWindow, shell, ipcMain, dialog, protocol } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readdirSync, statSync } from 'fs'
import { extname } from 'path'
import type { MediaFileInfo, ScanOptions } from '../src/types/electron'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Remove CSP headers for development
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    if (details.responseHeaders) {
      delete details.responseHeaders['content-security-policy']
      delete details.responseHeaders['x-frame-options']
      callback({ responseHeaders: details.responseHeaders })
    } else {
      callback({})
    }
  })

  // Debug: Log any errors
  mainWindow.webContents.on('crashed', () => {
    console.error('Renderer process crashed')
  })

  mainWindow.webContents.on('unresponsive', () => {
    console.error('Renderer process became unresponsive')
  })

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Register custom protocol for local files
  protocol.registerFileProtocol('safe-file', (request, callback) => {
    const url = request.url.substr(10) // Remove 'safe-file:' prefix
    callback(decodeURIComponent(url))
  })

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron.neeview-clone')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC handlers
  setupIpcHandlers()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s main process code.
// You can also put them in separate files and require them here.
function setupIpcHandlers() {
  // File dialog handlers
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Media Files',
          extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm']
        },
        {
          name: 'Image Files',
          extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
        },
        {
          name: 'Video Files',
          extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm']
        },
        {
          name: 'Archive Files',
          extensions: ['zip', 'rar', '7z']
        },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  // App control handlers
  ipcMain.on('app:minimize', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) window.minimize()
  })

  ipcMain.on('app:maximize', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    }
  })

  ipcMain.on('app:close', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) window.close()
  })

  // Folder scanning handler
  ipcMain.handle('folder:scan', async (_, folderPath: string, scanOptions: any) => {
    try {
      const mediaFiles = await scanFolderForMediaFiles(folderPath, scanOptions)
      return mediaFiles
    } catch (error) {
      console.error('Failed to scan folder:', error)
      throw error
    }
  })
}


async function scanFolderForMediaFiles(folderPath: string, options: ScanOptions = {}): Promise<MediaFileInfo[]> {
  const {
    includeSubfolders = false,
    sortBy = 'name',
    sortOrder = 'asc',
    fileTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm']
  } = options

  const mediaFiles: MediaFileInfo[] = []

  function getFileType(extension: string): 'image' | 'video' | 'unknown' {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
    const videoExts = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm']

    const ext = extension.toLowerCase()
    if (imageExts.includes(ext)) return 'image'
    if (videoExts.includes(ext)) return 'video'
    return 'unknown'
  }

  function scanDirectory(dirPath: string) {
    try {
      const items = readdirSync(dirPath, { withFileTypes: true })

      for (const item of items) {
        const fullPath = join(dirPath, item.name)

        if (item.isDirectory() && includeSubfolders) {
          scanDirectory(fullPath)
        } else if (item.isFile()) {
          const extension = extname(item.name).slice(1).toLowerCase()

          if (fileTypes.includes(extension)) {
            try {
              const stats = statSync(fullPath)
              const fileType = getFileType(extension)

              if (fileType !== 'unknown') {
                mediaFiles.push({
                  path: fullPath,
                  name: item.name,
                  type: fileType,
                  size: stats.size,
                  modified: stats.mtime.getTime()
                })
              }
            } catch (statError) {
              console.warn(`Failed to get stats for file: ${fullPath}`, statError)
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to read directory: ${dirPath}`, error)
    }
  }

  scanDirectory(folderPath)

  // Sort files based on options
  mediaFiles.sort((a, b) => {
    let comparison = 0

    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name)
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
    }

    return sortOrder === 'desc' ? -comparison : comparison
  })

  return mediaFiles
}