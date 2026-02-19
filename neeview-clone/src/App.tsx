import { useState, useEffect, useMemo } from 'react'
import { Toolbar } from './components/Toolbar/Toolbar'
import { FileList } from './components/FileList/FileList'
import { ImageViewer } from './components/ImageViewer/ImageViewer'
import { VideoPlayer } from './components/VideoPlayer/VideoPlayer'
import { WindowControls } from './components/WindowControls/WindowControls'
import { MediaFileInfo, ScanOptions, ViewMode, BindingDirection, ZipFileInfo, ZipScanOptions } from './types/electron.d'

export type MediaFile = (Omit<MediaFileInfo, 'modified'> | Omit<ZipFileInfo, 'modified'>) & {
  modified: Date
  // ZIP関連のプロパティ（ZipFileInfoにある場合）
  zipPath?: string
  internalPath?: string
  isZipContent?: boolean
}

function App() {
  const [currentFile, setCurrentFile] = useState<MediaFile | null>(null)
  const [files, setFiles] = useState<MediaFile[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(true)
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size' | 'type'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [includeSubfolders, setIncludeSubfolders] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('single')
  const [bindingDirection, setBindingDirection] = useState<BindingDirection>('right-to-left')
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)

  // ZIP関連の状態
  const [isZipMode, setIsZipMode] = useState<boolean>(false)
  const [currentZipPath, setCurrentZipPath] = useState<string | null>(null)

  // 見開きモードでのペアインデックスの先頭に揃える
  const getSpreadAlignedIndex = (index: number): number => {
    if (viewMode === 'single') return index
    // 表紙（index 0）は単独表示
    if (index === 0) return 0
    // index 1以降は奇数インデックスがペアの先頭
    // ペア: [1,2], [3,4], [5,6], ...
    if (index % 2 === 0) return index - 1
    return index
  }

  // 現在のインデックスから見開きペアを計算
  const spreadPages = useMemo(() => {
    if (viewMode === 'single' || files.length === 0) {
      return { left: currentFile, right: null }
    }

    const current = files[currentIndex]
    // 動画ファイルは常に単ページ表示
    if (current?.type === 'video') {
      return { left: current, right: null }
    }

    // 表紙（index 0）は単独表示
    if (currentIndex === 0) {
      return { left: current, right: null }
    }

    // ペア先頭のインデックス（奇数インデックス）
    const pairStart = getSpreadAlignedIndex(currentIndex)
    const firstFile = files[pairStart] || null
    const secondFile = files[pairStart + 1] || null

    // ペアの片方が動画なら単ページ表示
    if (firstFile?.type === 'video' || secondFile?.type === 'video') {
      return { left: current, right: null }
    }

    if (bindingDirection === 'right-to-left') {
      // 右綴じ：右ページが先、左ページが後（日本の漫画）
      return { left: secondFile, right: firstFile }
    } else {
      // 左綴じ：左ページが先、右ページが後（洋書）
      return { left: firstFile, right: secondFile }
    }
  }, [viewMode, bindingDirection, currentIndex, files, currentFile])

  const handleFileSelect = (_file: MediaFile, index: number) => {
    const alignedIndex = getSpreadAlignedIndex(index)
    setCurrentFile(files[alignedIndex])
    setCurrentIndex(alignedIndex)
  }

  const convertToMediaFile = (fileInfo: MediaFileInfo | ZipFileInfo): MediaFile => ({
    ...fileInfo,
    modified: new Date(fileInfo.modified)
  })

  // ZIP対応のURL生成
  const generateFileUrl = (file: MediaFile): string => {

    if (file.isZipContent && file.zipPath && file.internalPath) {
      // ZIP内ファイル用URL: safe-file://zip::{zipPath}::{internalPath}
      // パスの各部分を個別にエンコード
      const encodedZipPath = encodeURIComponent(file.zipPath)
      const encodedInternalPath = encodeURIComponent(file.internalPath)

      const zipUrl = `safe-file://zip::${encodedZipPath}::${encodedInternalPath}`
      return zipUrl
    } else {
      // 通常ファイルの処理をファイル種別で分ける
      if (file.type === 'video') {
        // 動画ファイルは VideoPlayer で直接 file:// プロトコルを使用するため
        // App.tsx側では safe-file:// を返すが、実際はVideoPlayerで上書きされる
      } else if (file.type === 'image') {
        // 画像ファイルも ImageViewer で直接 file:// プロトコルを使用するため
        // App.tsx側では safe-file:// を返すが、実際はImageViewerで上書きされる
      }

      // 通常ファイル用URL - safe-file:// プロトコルを返すが、実際は各コンポーネントで上書きされる
      const encodedPath = encodeURIComponent(file.path)
      const regularUrl = `safe-file://${encodedPath}`
      return regularUrl
    }
  }

  const rescanFolder = async () => {
    if (!currentFolder) {
      setError('スキャンするフォルダが指定されていません。')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const scanOptions: ScanOptions = {
        includeSubfolders,
        sortBy,
        sortOrder,
        fileTypes: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm']
      }

      if (!window.api?.scanFolder) {
        throw new Error('フォルダスキャン機能が利用できません。アプリケーションを再起動してください。')
      }

      const scannedFiles = await window.api.scanFolder(currentFolder, scanOptions)

      if (!Array.isArray(scannedFiles)) {
        throw new Error('フォルダスキャンの結果が不正です。')
      }

      const mediaFiles = scannedFiles.map(convertToMediaFile)

      setFiles(mediaFiles)

      // Maintain current file selection if it still exists
      if (currentFile && mediaFiles.some(f => f.path === currentFile.path)) {
        const newIndex = mediaFiles.findIndex(f => f.path === currentFile.path)
        setCurrentIndex(newIndex)
      } else if (mediaFiles.length > 0) {
        setCurrentFile(mediaFiles[0])
        setCurrentIndex(0)
      } else {
        setCurrentFile(null)
        setCurrentIndex(0)
      }

      if (mediaFiles.length === 0) {
        setError(`フォルダ内にメディアファイルが見つかりませんでした。\nフォルダ: ${currentFolder}`)
      }
    } catch (error) {
      console.error('Failed to scan folder:', error)
      const errorMessage = error instanceof Error ? error.message : 'フォルダのスキャンに失敗しました。'
      setError(`スキャンエラー: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenFolder = async () => {
    if (!window.api?.openDirectory) {
      setError('フォルダ選択機能が利用できません。アプリケーションを再起動してください。')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const folderPath = await window.api.openDirectory()
      if (folderPath) {
        setCurrentFolder(folderPath)

        if (!window.api?.scanFolder) {
          throw new Error('フォルダスキャン機能が利用できません。')
        }

        const scanOptions: ScanOptions = {
          includeSubfolders,
          sortBy,
          sortOrder,
          fileTypes: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm']
        }

        const scannedFiles = await window.api.scanFolder(folderPath, scanOptions)

        if (!Array.isArray(scannedFiles)) {
          throw new Error('フォルダスキャンの結果が不正です。')
        }

        const mediaFiles = scannedFiles.map(convertToMediaFile)

        setFiles(mediaFiles)
        if (mediaFiles.length > 0) {
          setCurrentFile(mediaFiles[0])
          setCurrentIndex(0)
        } else {
          setCurrentFile(null)
          setCurrentIndex(0)
          setError(`選択されたフォルダ内にメディアファイルが見つかりませんでした。\nフォルダ: ${folderPath}`)
        }
      }
    } catch (error) {
      console.error('Failed to open folder:', error)
      const errorMessage = error instanceof Error ? error.message : 'フォルダの選択に失敗しました。'
      setError(`フォルダ選択エラー: ${errorMessage}`)
      setCurrentFolder(null)
    } finally {
      setIsLoading(false)
    }
  }

  // ZIP専用のファイル処理
  const handleOpenZipFile = async (zipFilePath: string) => {
    setIsLoading(true)
    setError(null)

    try {
      if (!window.api?.scanZip) {
        throw new Error('ZIP機能が利用できません。アプリケーションを再起動してください。')
      }

      // ZIPファイルをスキャン
      const scanOptions: ZipScanOptions = {
        sortBy,
        sortOrder,
        validateZip: true
      }

      const { files: zipFiles, info } = await window.api.scanZip(zipFilePath, scanOptions)

      if (!Array.isArray(zipFiles)) {
        throw new Error('ZIPスキャンの結果が不正です。')
      }

      const mediaFiles = zipFiles.map(convertToMediaFile)

      // ZIP関連の状態を設定
      setIsZipMode(true)
      setCurrentZipPath(zipFilePath)
      setFiles(mediaFiles)
      setCurrentFolder(null) // Clear folder context

      if (mediaFiles.length > 0) {
        setCurrentFile(mediaFiles[0])
        setCurrentIndex(0)
      } else {
        setCurrentFile(null)
        setCurrentIndex(0)
        setError(`ZIPファイル内にメディアファイルが見つかりませんでした。\nファイル: ${zipFilePath}\n総ファイル数: ${info.fileCount}`)
      }

      console.log(`ZIP loaded: ${info.mediaFileCount} media files out of ${info.fileCount} total files`)
    } catch (error) {
      console.error('Failed to open ZIP file:', error)
      const errorMessage = error instanceof Error ? error.message : 'ZIPファイルの処理に失敗しました。'
      setError(`ZIP処理エラー: ${errorMessage}`)
      setIsZipMode(false)
      setCurrentZipPath(null)
    } finally {
      setIsLoading(false)
    }
  }

  // 通常ファイルとZIPファイルを統合したファイル選択
  const handleOpenFile = async () => {
    if (!window.api?.openFile) {
      setError('ファイル選択機能が利用できません。アプリケーションを再起動してください。')
      return
    }

    setError(null)

    try {
      const filePath = await window.api.openFile()
      if (filePath) {
        const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || 'unknown'
        const fileExt = fileName.split('.').pop()?.toLowerCase() || ''

        // ZIPファイルかチェック
        if (fileExt === 'zip') {
          await handleOpenZipFile(filePath)
          return
        }

        // 通常のメディアファイル処理
        let type: 'image' | 'video' | 'unknown' = 'unknown'
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(fileExt)) {
          type = 'image'
        } else if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'].includes(fileExt)) {
          type = 'video'
        }

        if (type === 'unknown') {
          setError(`サポートされていないファイル形式です: ${fileExt}\n対応形式: 画像 (jpg, png, gif, webp, bmp, svg), 動画 (mp4, avi, mkv, mov, wmv, flv, webm), ZIP (zip)`)
          return
        }

        const file: MediaFile = {
          path: filePath,
          name: fileName,
          type,
          size: 0,
          modified: new Date(),
          isZipContent: false
        }

        // 通常ファイルモードに設定
        setIsZipMode(false)
        setCurrentZipPath(null)
        setFiles([file])
        setCurrentFile(file)
        setCurrentIndex(0)
        setCurrentFolder(null)
      }
    } catch (error) {
      console.error('Failed to open file:', error)
      const errorMessage = error instanceof Error ? error.message : 'ファイルの選択に失敗しました。'
      setError(`ファイル選択エラー: ${errorMessage}`)
    }
  }

  const handlePrevious = () => {
    if (files.length > 0 && currentIndex > 0) {
      let newIndex: number
      if (viewMode === 'spread' && currentIndex > 1) {
        // 見開きモード：2ページ戻る（ただし表紙を越えない）
        newIndex = Math.max(currentIndex - 2, 0)
      } else {
        newIndex = currentIndex - 1
      }
      newIndex = getSpreadAlignedIndex(newIndex)
      setCurrentIndex(newIndex)
      setCurrentFile(files[newIndex])
    }
  }

  const handleNext = () => {
    if (files.length > 0 && currentIndex < files.length - 1) {
      let newIndex: number
      if (viewMode === 'spread' && currentIndex > 0) {
        // 見開きモード：2ページ進む
        newIndex = Math.min(currentIndex + 2, files.length - 1)
      } else if (viewMode === 'spread' && currentIndex === 0) {
        // 表紙から次へ：index 1へ
        newIndex = 1
      } else {
        newIndex = currentIndex + 1
      }
      newIndex = getSpreadAlignedIndex(newIndex)
      setCurrentIndex(newIndex)
      setCurrentFile(files[newIndex])
    }
  }

  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible)
  }

  const handleSortChange = (newSortBy: 'name' | 'date' | 'size' | 'type', newSortOrder?: 'asc' | 'desc') => {
    const finalSortOrder = newSortOrder || (newSortBy === sortBy ? (sortOrder === 'asc' ? 'desc' : 'asc') : 'asc')
    setSortBy(newSortBy)
    setSortOrder(finalSortOrder)
  }

  const toggleSubfolders = () => {
    setIncludeSubfolders(!includeSubfolders)
  }

  const handleToggleFullscreen = async () => {
    if (!window.api?.toggleFullscreen) return

    try {
      const newState = await window.api.toggleFullscreen()
      setIsFullscreen(newState)
    } catch (error) {
      console.error('Failed to toggle fullscreen:', error)
      setError('フルスクリーンの切り替えに失敗しました。')
    }
  }

  const handleExitFullscreen = async () => {
    if (!window.api?.exitFullscreen) return

    try {
      const newState = await window.api.exitFullscreen()
      setIsFullscreen(newState)
    } catch (error) {
      console.error('Failed to exit fullscreen:', error)
      setError('フルスクリーンの終了に失敗しました。')
    }
  }

  // Check initial fullscreen state
  useEffect(() => {
    const checkFullscreenState = async () => {
      if (!window.api?.getFullscreenState) return

      try {
        const state = await window.api.getFullscreenState()
        setIsFullscreen(state)
      } catch (error) {
        console.error('Failed to get fullscreen state:', error)
      }
    }

    checkFullscreenState()
  }, [])

  // Auto-rescan when sort options change
  useEffect(() => {
    if (currentFolder) {
      rescanFolder()
    }
  }, [sortBy, sortOrder, includeSubfolders])

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
          handleToggleFullscreen()
          break
        case 'Escape':
          if (isFullscreen) {
            e.preventDefault()
            handleExitFullscreen()
          }
          break
        case 'Tab':
          e.preventDefault()
          toggleSidebar()
          break
        case 'o':
          if (e.ctrlKey && !e.shiftKey) {
            e.preventDefault()
            handleOpenFile()
          } else if (e.ctrlKey && e.shiftKey) {
            e.preventDefault()
            handleOpenFolder()
          }
          break
        case 'F5':
          e.preventDefault()
          if (currentFolder) {
            rescanFolder()
          }
          break
        case 's':
          if (!e.ctrlKey && !e.altKey) {
            e.preventDefault()
            setViewMode(prev => prev === 'single' ? 'spread' : 'single')
          }
          break
        case 'r':
          if (!e.ctrlKey && !e.altKey) {
            e.preventDefault()
            setBindingDirection(prev => prev === 'right-to-left' ? 'left-to-right' : 'right-to-left')
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, files, viewMode, bindingDirection, isFullscreen])

  const renderViewer = () => {
    if (error) {
      return (
        <div className="flex-1 flex items-center justify-center text-red-400">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4">⚠️</div>
            <div className="text-xl mb-2">エラーが発生しました</div>
            <div className="text-sm whitespace-pre-line bg-gray-800 p-4 rounded border border-red-600">
              {error}
            </div>
            <button
              onClick={() => setError(null)}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      )
    }

    if (!currentFile) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-6xl mb-4">📁</div>
            <div className="text-xl mb-2">ファイル・フォルダを開く</div>
            <div className="text-sm space-y-1">
              <div>📁 Ctrl+O でファイルを選択</div>
              <div>📂 Ctrl+Shift+O でフォルダを選択</div>
              <div>またはファイルをドラッグ＆ドロップ</div>
            </div>
          </div>
        </div>
      )
    }

    // 見開きモードで画像ペアがある場合
    if (viewMode === 'spread' && currentFile.type === 'image' && (spreadPages.left || spreadPages.right)) {
      return (
        <ImageViewer
          key={`${currentFile.path}-${viewMode}-spread`}
          file={currentFile}
          viewMode={viewMode}
          spreadPages={spreadPages}
          generateFileUrl={generateFileUrl}
        />
      )
    }

    switch (currentFile.type) {
      case 'image':
        return (
          <ImageViewer
            key={`${currentFile.path}-${viewMode}`}
            file={currentFile}
            viewMode={viewMode}
            spreadPages={{ left: currentFile, right: null }}
            generateFileUrl={generateFileUrl}
          />
        )
      case 'video':
        return <VideoPlayer file={currentFile} generateFileUrl={generateFileUrl} />
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
      {!isFullscreen && <WindowControls />}
      {!isFullscreen && (
        <Toolbar
        onOpenFile={handleOpenFile}
        onOpenFolder={handleOpenFolder}
        onPrevious={handlePrevious}
        onNext={handleNext}
        onToggleSidebar={toggleSidebar}
        onSortChange={handleSortChange}
        onToggleSubfolders={toggleSubfolders}
        canGoNext={files.length > 0 && currentIndex < files.length - 1}
        canGoPrevious={files.length > 0 && currentIndex > 0}
        currentFile={currentFile}
        currentFolder={currentFolder}
        isLoading={isLoading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        includeSubfolders={includeSubfolders}
        fileCount={files.length}
        viewMode={viewMode}
        bindingDirection={bindingDirection}
        onViewModeChange={setViewMode}
        onBindingDirectionChange={setBindingDirection}
      />
      )}

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