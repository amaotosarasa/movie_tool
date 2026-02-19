import { app, BrowserWindow, shell, ipcMain, dialog, protocol } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readdirSync, statSync } from 'fs'
import { extname, basename, dirname } from 'path'
import { copyFile } from 'fs/promises'
import type { MediaFileInfo, ScanOptions, ZipScanOptions } from '../src/types/electron.d'
import { ZipHandler } from '../src/utils/zipHandler'
import { TempFileManager } from '../src/utils/tempFileManager'
import { tmpdir } from 'os'

// Register custom protocol schemes before app ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'safe-file', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])

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
      webSecurity: false,
      allowRunningInsecureContent: true,
      experimentalFeatures: true,
      enableRemoteModule: false,
      // 動画ファイルの直接アクセスを有効にする追加設定
      backgroundThrottling: false
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
  // Set app to handle safe-file protocol globally
  app.setAsDefaultProtocolClient('safe-file')

  // Register custom protocol for local files and ZIP contents (hybrid approach)
  protocol.registerBufferProtocol('safe-file', async (request, callback) => {
    console.log(`=== PROTOCOL HANDLER DEBUG START ===`)
    console.log('Original URL:', request.url)

    try {
      // Extract and decode path from URL
      let filePath = request.url.replace('safe-file://', '')
      console.log('Step 1: Raw URL path after protocol removal:', filePath)
      filePath = decodeURIComponent(filePath)
      console.log('Step 2: Decoded file path:', filePath)

      // Check if this is a ZIP file request: zip::{zipPath}::{internalPath}
      if (filePath.startsWith('zip::')) {
        console.log('✓ Detected ZIP file request')
        const parts = filePath.split('::')
        console.log('Step 3: Split parts:', parts)

        if (parts.length === 3) {
          const [, encodedZipPath, encodedInternalPath] = parts
          console.log('Step 4: Encoded paths:')
          console.log('  Zip Path (encoded):', encodedZipPath)
          console.log('  Internal Path (encoded):', encodedInternalPath)

          // エンコードされたパスをデコード
          const zipPath = decodeURIComponent(encodedZipPath)
          const internalPath = decodeURIComponent(encodedInternalPath)

          console.log('Step 5: Final decoded paths:')
          console.log('  Zip Path (final):', zipPath)
          console.log('  Internal Path (final):', internalPath)
          console.log(`Calling ZipHandler.extractFile("${zipPath}", "${internalPath}")`)

          try {
            const zipHandler = new ZipHandler()
            const buffer = await zipHandler.extractFile(zipPath, internalPath)
            const mimeType = getMimeType(internalPath)

            console.log(`✅ ZIP file extracted successfully: ${buffer.length} bytes, MIME: ${mimeType}`)
            console.log(`=== PROTOCOL HANDLER DEBUG END (SUCCESS) ===`)

            // For ZIP files, return buffer directly
            callback({ mimeType, data: buffer })
            return
          } catch (error) {
            console.log(`❌ ZIP extraction failed:`)
            console.error('Error details:', error)
            console.log(`=== PROTOCOL HANDLER DEBUG END (ZIP FAILED) ===`)
            callback({ error: -6 })
            return
          }
        } else {
          console.log(`❌ Invalid ZIP URL format - expected 3 parts, got ${parts.length}`)
          console.log(`=== PROTOCOL HANDLER DEBUG END (INVALID FORMAT) ===`)
          callback({ error: -6 })
          return
        }
      }

      // Regular file handling - fix Windows path issues
      let cleanPath = filePath

      // Windows path normalization:
      // Handle common Windows path patterns from URL parsing
      console.log('Checking path for Windows pattern:', cleanPath)
      if (cleanPath.startsWith('/') && cleanPath.length > 1) {
        // Remove leading slash if it looks like a Windows absolute path
        if (/^\/[A-Za-z][:/\\]/.test(cleanPath)) {
          cleanPath = cleanPath.substring(1)
          console.log('Removed leading slash from Windows path')
        }
      }

      console.log('Final file path for reading:', cleanPath)

      // Smart file handling: use temp files for videos to bypass HTML5 limitations
      const { readFile, stat } = await import('fs/promises')
      const mimeType = getMimeType(cleanPath)

      // Check if this is a video file
      const isVideo = mimeType.startsWith('video/')
      console.log(`File type determined: ${mimeType}, isVideo: ${isVideo}`)

      if (isVideo) {
        // For video files, create a temporary file and redirect to file:// protocol
        // This allows HTML5 video elements to properly stream large files
        console.log('Processing video file - creating temporary file for streaming')

        try {
          // Check file size first
          const stats = await stat(cleanPath)
          console.log(`Video file size: ${stats.size} bytes`)

          // Generate unique temp file name
          const uniqueId = Date.now() + '_' + Math.random().toString(36).substr(2, 9)
          const ext = extname(cleanPath)
          const tempFileName = `video_${uniqueId}${ext}`
          const tempFilePath = join(tmpdir(), 'neeview-temp', tempFileName)

          // Ensure temp directory exists
          const { mkdir } = await import('fs/promises')
          await mkdir(dirname(tempFilePath), { recursive: true })

          // Copy file to temp location (this handles any size file efficiently)
          console.log(`Copying video to temp location: ${tempFilePath}`)
          await copyFile(cleanPath, tempFilePath)

          // Return redirect to file:// protocol which HTML5 video can handle
          const fileUrl = `file:///${tempFilePath.replace(/\\/g, '/')}`
          console.log(`Redirecting video to: ${fileUrl}`)

          // Schedule cleanup after 1 hour
          setTimeout(async () => {
            try {
              const { unlink } = await import('fs/promises')
              await unlink(tempFilePath)
              console.log(`Cleaned up temp video file: ${tempFilePath}`)
            } catch (cleanupError) {
              console.warn('Failed to cleanup temp video file:', cleanupError)
            }
          }, 3600000) // 1 hour

          // Return a redirect response
          callback({
            statusCode: 302,
            headers: {
              'Location': fileUrl,
              'Access-Control-Allow-Origin': '*'
            }
          })
          return

        } catch (videoError) {
          console.error('Failed to process video file:', videoError)
          callback({ error: -6 })
          return
        }
      }

      // For non-video files (images), use direct buffer approach
      console.log('Processing image file - using direct buffer approach')
      const buffer = await readFile(cleanPath)
      console.log(`Successfully read image file: ${buffer.length} bytes, MIME: ${mimeType}`)

      // Provide complete headers for image display
      callback({
        mimeType,
        data: buffer,
        headers: {
          'Content-Length': buffer.length.toString(),
          'Cache-Control': 'public, max-age=3600'
        }
      })

    } catch (error) {
      console.error('Failed to process request:', error)
      callback({ error: -6 })
    }
  })

  // Helper function for MIME type detection
  function getMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase()
    const mimeTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.mov': 'video/quicktime',
      '.wmv': 'video/x-ms-wmv',
      '.webm': 'video/webm',
      '.flv': 'video/x-flv',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed'
    }
    return mimeTypes[ext] || 'application/octet-stream'
  }

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
          extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'zip', 'rar', '7z']
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

  // Fullscreen handlers
  ipcMain.handle('window:toggle-fullscreen', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) {
      const isFullscreen = window.isFullScreen()
      window.setFullScreen(!isFullscreen)
      return !isFullscreen
    }
    return false
  })

  ipcMain.handle('window:exit-fullscreen', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window && window.isFullScreen()) {
      window.setFullScreen(false)
      return false
    }
    return window ? window.isFullScreen() : false
  })

  ipcMain.handle('window:get-fullscreen-state', () => {
    const window = BrowserWindow.getFocusedWindow()
    return window ? window.isFullScreen() : false
  })

  // ZIP operations handlers
  setupZipHandlers()
}

// ZIP related IPC handlers
function setupZipHandlers() {
  // Initialize TempFileManager
  TempFileManager.initialize().catch(error => {
    console.error('Failed to initialize TempFileManager:', error)
  })

  // Create temp directory for video files asynchronously
  import('fs/promises').then(async ({ mkdir }) => {
    const tempDir = join(tmpdir(), 'neeview-temp')
    await mkdir(tempDir, { recursive: true }).catch(error => {
      console.warn('Failed to create temp directory:', error)
    })
  })

  // ZIP temp file extraction
  ipcMain.handle('zip:extractToTempFile', async (_, zipPath: string, internalPath: string): Promise<string> => {
    try {
      const zipHandler = new ZipHandler()
      return await zipHandler.extractToTempFile(zipPath, internalPath)
    } catch (error) {
      console.error('ZIP temp file extraction failed:', error)
      throw error
    }
  })

  // ZIP file scanning
  ipcMain.handle('zip:scan', async (_, zipPath: string, options?: ZipScanOptions) => {
    try {
      const zipHandler = new ZipHandler()
      const files = await zipHandler.listMediaFiles(zipPath, options)
      const info = await zipHandler.validateZip(zipPath)
      return { files, info }
    } catch (error) {
      console.error('ZIP scan error:', error)
      throw error
    }
  })

  // ZIP file extraction
  ipcMain.handle('zip:extractFile', async (_, zipPath: string, internalPath: string, options?: { priority?: 'high' | 'normal' }) => {
    try {
      const zipHandler = new ZipHandler()
      const buffer = await zipHandler.extractFile(zipPath, internalPath)

      // Save to temp file
      const tempFilePath = await TempFileManager.saveTempFile(buffer, internalPath, zipPath)

      // Update access time for cache management
      TempFileManager.updateAccess(tempFilePath)

      return tempFilePath
    } catch (error) {
      console.error('ZIP extraction error:', error)
      throw error
    }
  })

  // ZIP validation
  ipcMain.handle('zip:validate', async (_, zipPath: string) => {
    try {
      const zipHandler = new ZipHandler()
      const info = await zipHandler.validateZip(zipPath)
      return info
    } catch (error) {
      console.error('ZIP validation error:', error)
      throw error
    }
  })

  // ZIP temp file cleanup
  ipcMain.handle('zip:cleanupTemp', async (_, zipPath?: string) => {
    try {
      if (zipPath) {
        return await TempFileManager.cleanupZip(zipPath)
      } else {
        return await TempFileManager.cleanupAll()
      }
    } catch (error) {
      console.error('ZIP cleanup error:', error)
      throw error
    }
  })

  // ZIP cache optimization
  ipcMain.handle('zip:optimizeCache', async () => {
    try {
      const stats = TempFileManager.getTempDirectoryStats()
      const cleanupResult = await TempFileManager.cleanupOldFiles()

      return {
        freed: cleanupResult.cleaned,
        remaining: stats.fileCount - cleanupResult.cleaned
      }
    } catch (error) {
      console.error('ZIP cache optimization error:', error)
      throw error
    }
  })

  // ZIP operation cancellation (basic implementation for Phase 2)
  ipcMain.handle('zip:cancelOperation', async (_, operationId: string) => {
    try {
      // Phase 2: Basic implementation - always return false (not implemented)
      console.warn('ZIP operation cancellation not yet implemented:', operationId)
      return false
    } catch (error) {
      console.error('ZIP cancel error:', error)
      throw error
    }
  })

  // ZIP operation progress (basic implementation for Phase 2)
  ipcMain.handle('zip:getProgress', async (_, operationId: string) => {
    try {
      // Phase 2: Basic implementation - always return null (not implemented)
      console.warn('ZIP progress tracking not yet implemented:', operationId)
      return null
    } catch (error) {
      console.error('ZIP progress error:', error)
      throw error
    }
  })

  // ZIP files preloading (basic implementation for Phase 2)
  ipcMain.handle('zip:preloadFiles', async (_, zipPath: string, filePaths: string[]) => {
    try {
      // Phase 2: Basic implementation - log only
      console.log('ZIP preloading requested for:', zipPath, filePaths.length, 'files')
      // In Phase 3, this will implement background extraction
      return Promise.resolve()
    } catch (error) {
      console.error('ZIP preload error:', error)
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