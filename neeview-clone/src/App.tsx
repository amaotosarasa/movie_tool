import React, { useState, useEffect } from 'react'
import { Toolbar } from './components/Toolbar/Toolbar'
import { FileList } from './components/FileList/FileList'
import { ImageViewer } from './components/ImageViewer/ImageViewer'
import { VideoPlayer } from './components/VideoPlayer/VideoPlayer'
import { WindowControls } from './components/WindowControls/WindowControls'

export interface MediaFile {
  path: string
  name: string
  type: 'image' | 'video' | 'unknown'
  size: number
  modified: Date
}

function App() {
  const [currentFile, setCurrentFile] = useState<MediaFile | null>(null)
  const [files, setFiles] = useState<MediaFile[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(true)

  const handleFileSelect = (file: MediaFile, index: number) => {
    setCurrentFile(file)
    setCurrentIndex(index)
  }

  const handleOpenFile = async () => {
    console.log('=== File open button clicked ===')
    console.log('window object:', typeof window)
    console.log('window.api:', window.api)
    console.log('window.electron:', window.electron)
    console.log('Available APIs:', {
      electron: typeof window.electron,
      api: typeof window.api,
      openFile: window.api ? typeof window.api.openFile : 'window.api is undefined'
    })

    // More detailed debugging
    if (window.api) {
      console.log('API object keys:', Object.keys(window.api))
      console.log('openFile function:', window.api.openFile)
    }

    if (!window.api) {
      console.error('window.api is not available')
      alert('API not loaded. Please check the console for errors and restart the app.')
      return
    }

    if (typeof window.api.openFile !== 'function') {
      console.error('window.api.openFile is not a function:', typeof window.api.openFile)
      alert(`ファイル選択機能が正しく読み込まれていません。openFile type: ${typeof window.api.openFile}`)
      return
    }

    try {
      console.log('Calling window.api.openFile()...')
      const filePath = await window.api.openFile()
      console.log('File selected:', filePath)
      if (filePath) {
        // Here we would normally scan the directory and get file info
        // For now, we'll just create a basic file object
        const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || 'unknown'
        const fileExt = fileName.split('.').pop()?.toLowerCase() || ''

        let type: 'image' | 'video' | 'unknown' = 'unknown'
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(fileExt)) {
          type = 'image'
        } else if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'].includes(fileExt)) {
          type = 'video'
        }

        const file: MediaFile = {
          path: filePath,
          name: fileName,
          type,
          size: 0, // Would be populated by file system API
          modified: new Date()
        }

        setFiles([file])
        setCurrentFile(file)
        setCurrentIndex(0)
      }
    } catch (error) {
      console.error('Failed to open file:', error)
    }
  }

  const handlePrevious = () => {
    if (files.length > 0 && currentIndex > 0) {
      const newIndex = currentIndex - 1
      setCurrentIndex(newIndex)
      setCurrentFile(files[newIndex])
    }
  }

  const handleNext = () => {
    if (files.length > 0 && currentIndex < files.length - 1) {
      const newIndex = currentIndex + 1
      setCurrentIndex(newIndex)
      setCurrentFile(files[newIndex])
    }
  }

  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          handlePrevious()
          break
        case 'ArrowRight':
          e.preventDefault()
          handleNext()
          break
        case 'F11':
          e.preventDefault()
          // Toggle fullscreen (would need additional IPC)
          break
        case 'Tab':
          e.preventDefault()
          toggleSidebar()
          break
        case 'o':
          if (e.ctrlKey) {
            e.preventDefault()
            handleOpenFile()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, files])

  const renderViewer = () => {
    if (!currentFile) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-6xl mb-4">📁</div>
            <div className="text-xl mb-2">ファイルを開く</div>
            <div className="text-sm">
              Ctrl+O でファイルを選択するか、ファイルをドラッグ＆ドロップしてください
            </div>
          </div>
        </div>
      )
    }

    switch (currentFile.type) {
      case 'image':
        return <ImageViewer file={currentFile} />
      case 'video':
        return <VideoPlayer file={currentFile} />
      default:
        return (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-6xl mb-4">❓</div>
              <div className="text-xl mb-2">サポートされていないファイル形式</div>
              <div className="text-sm">{currentFile.name}</div>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      <WindowControls />
      <Toolbar
        onOpenFile={handleOpenFile}
        onPrevious={handlePrevious}
        onNext={handleNext}
        onToggleSidebar={toggleSidebar}
        canGoNext={files.length > 0 && currentIndex < files.length - 1}
        canGoPrevious={files.length > 0 && currentIndex > 0}
        currentFile={currentFile}
      />

      <div className="flex flex-1 overflow-hidden">
        {sidebarVisible && (
          <FileList
            files={files}
            currentIndex={currentIndex}
            onFileSelect={handleFileSelect}
          />
        )}
        <div className="flex-1 flex flex-col">
          {renderViewer()}
        </div>
      </div>
    </div>
  )
}

export default App