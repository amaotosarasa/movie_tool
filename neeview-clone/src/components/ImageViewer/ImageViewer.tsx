import React, { useState, useRef, useCallback, useEffect } from 'react'
import { MediaFile } from '../../App'
import { ViewMode } from '../../types/electron'

interface SpreadPages {
  left: MediaFile | null
  right: MediaFile | null
}

interface ImageViewerProps {
  file: MediaFile
  viewMode: ViewMode
  spreadPages: SpreadPages
}

function getImageSrc(file: MediaFile): string {
  return file.path.startsWith('safe-file:')
    ? file.path
    : `safe-file:${file.path.replace(/\\/g, '/')}`
}

export function ImageViewer({ file, viewMode, spreadPages }: ImageViewerProps) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [fitMode, setFitMode] = useState<'fit' | 'width' | 'actual'>('fit')
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [spreadImageSizes, setSpreadImageSizes] = useState<{
    left: { width: number; height: number } | null
    right: { width: number; height: number } | null
  }>({ left: null, right: null })
  const [rotation, setRotation] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const isSpread = viewMode === 'spread' && spreadPages.left && spreadPages.right

  // 表紙判定: spreadPages.rightがnullの場合は表紙または単独表示
  const isCoverPage = !spreadPages.right

  // 見開きモード時の実際の合計サイズを取得
  const getSpreadDimensions = useCallback(() => {
    if (!isSpread || !spreadImageSizes.left || !spreadImageSizes.right) {
      return null
    }

    const totalWidth = spreadImageSizes.left.width + spreadImageSizes.right.width
    const maxHeight = Math.max(spreadImageSizes.left.height, spreadImageSizes.right.height)

    return { width: totalWidth, height: maxHeight }
  }, [isSpread, spreadImageSizes])

  // 見開きモード時の実際の表示サイズを計算（CSS制約を考慮）
  const getActualSpreadDisplaySize = useCallback(() => {
    if (!isSpread || !spreadImageSizes.left || !spreadImageSizes.right || !containerRef.current) {
      return null
    }

    const containerWidth = containerRef.current.clientWidth
    const containerHeight = containerRef.current.clientHeight
    const leftImg = spreadImageSizes.left
    const rightImg = spreadImageSizes.right

    // 各画像を自然な縦横比でコンテナに収めた時のサイズを計算
    const leftAspectRatio = leftImg.width / leftImg.height
    const rightAspectRatio = rightImg.width / rightImg.height

    // 高さ基準でのサイズ計算
    let leftDisplayWidth = containerHeight * leftAspectRatio
    let leftDisplayHeight = containerHeight
    let rightDisplayWidth = containerHeight * rightAspectRatio
    let rightDisplayHeight = containerHeight

    // 合計幅がコンテナ幅を超える場合は、幅基準でスケーリング
    const totalNaturalWidth = leftDisplayWidth + rightDisplayWidth
    if (totalNaturalWidth > containerWidth) {
      const scaleRatio = containerWidth / totalNaturalWidth
      leftDisplayWidth *= scaleRatio
      leftDisplayHeight *= scaleRatio
      rightDisplayWidth *= scaleRatio
      rightDisplayHeight *= scaleRatio
    }

    return {
      width: leftDisplayWidth + rightDisplayWidth,
      height: Math.max(leftDisplayHeight, rightDisplayHeight),
      leftWidth: leftDisplayWidth,
      rightWidth: rightDisplayWidth
    }
  }, [isSpread, spreadImageSizes])

  // Reset view when file changes
  useEffect(() => {
    // File changed, resetting view
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setRotation(0)
    setFitMode('fit')
    setSpreadImageSizes({ left: null, right: null })
  }, [file.path])

  // Calculate fit scale based on container and image size
  const calculateFitScale = useCallback(() => {
    if (!containerRef.current) {
      // containerRef not available
      return 1
    }

    const container = containerRef.current
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight
    // Container dimensions retrieved

    // 見開きモードの場合は実際の表示サイズを使用
    if (isSpread) {
      const actualDisplaySize = getActualSpreadDisplaySize()
      if (!actualDisplaySize) return 1

      // マージンを考慮してコンテナサイズの95%に収める
      const effectiveWidth = containerWidth * 0.95
      const effectiveHeight = containerHeight * 0.95

      const scaleX = effectiveWidth / actualDisplaySize.width
      const scaleY = effectiveHeight / actualDisplaySize.height

      // デバッグ用ログ
      console.log('Spread scale calculation:', {
        containerWidth,
        containerHeight,
        actualDisplaySize,
        effectiveWidth,
        effectiveHeight,
        scaleX,
        scaleY,
        resultScale: Math.min(scaleX, scaleY, 1),
        fitMode
      })

      switch (fitMode) {
        case 'fit':
          return Math.min(scaleX, scaleY, 1)
        case 'width':
          return scaleX
        case 'actual':
          return 1
        default:
          return 1
      }
    } else {
      // 単ページモード
      if (!imageSize.width || !imageSize.height) return 1

      const scaleX = containerWidth / imageSize.width
      const scaleY = containerHeight / imageSize.height

      switch (fitMode) {
        case 'fit':
          return Math.min(scaleX, scaleY, 1)
        case 'width':
          return scaleX
        case 'actual':
          return 1
        default:
          return 1
      }
    }
  }, [imageSize, fitMode, isSpread, getActualSpreadDisplaySize])

  // Helper function to get rotated dimensions
  function getRotatedDimensions(width: number, height: number, rotation: number): { width: number; height: number } {
    const normalizedRotation = Math.abs(rotation) % 180
    if (normalizedRotation === 90) {
      return { width: height, height: width }
    }
    return { width, height }
  }

  // Helper function to center image
  const centerImage = useCallback((
    containerWidth: number,
    containerHeight: number,
    imageWidth: number,
    imageHeight: number,
    scale: number,
    rotation?: number,
    useSpreadDims?: boolean
  ): { x: number; y: number } => {
    // centerImage called - calculating center position

    let targetWidth = imageWidth
    let targetHeight = imageHeight

    // 見開きモードの場合は実際の表示サイズを使用
    if (useSpreadDims) {
      const actualDisplaySize = getActualSpreadDisplaySize()
      // Using actual spread display size
      if (actualDisplaySize) {
        targetWidth = actualDisplaySize.width
        targetHeight = actualDisplaySize.height
      }
    }

    // Get actual image dimensions considering rotation
    const rotatedDims = getRotatedDimensions(targetWidth, targetHeight, rotation || 0)

    // Calculate display dimensions with scale
    const displayWidth = rotatedDims.width * scale
    const displayHeight = rotatedDims.height * scale

    // Calculate center position
    const x = (containerWidth - displayWidth) / 2
    const y = (containerHeight - displayHeight) / 2

    return { x, y }
  }, [getActualSpreadDisplaySize])

  // Handle view mode changes
  useEffect(() => {
    console.log('🔄 viewMode changed:', viewMode, 'isCoverPage:', isCoverPage)
    // viewMode が変更された場合、適切なフィットモードに設定
    if (isCoverPage) {
      // 表紙または単独表示の場合は常に'fit'モード
      console.log('📕 Setting fitMode to fit for cover page')
      setFitMode('fit')
    } else if (viewMode === 'spread') {
      console.log('📖 Setting fitMode to width for spread view')
      setFitMode('width') // 見開きモード時は幅に合わせるモードが適切
    } else if (viewMode === 'single') {
      console.log('📄 Setting fitMode to fit for single view')
      setFitMode('fit') // 単ページモード時はウィンドウに合わせるモードが適切
    }
  }, [viewMode, isCoverPage])

  // Apply fit mode
  useEffect(() => {
    if (!containerRef.current) {
      // Container not available for fit mode
      return
    }

    // Fit mode effect triggered

    // 見開きモードの場合は両方の画像がロードされるまで待つ
    if (isSpread && (!spreadImageSizes.left || !spreadImageSizes.right)) {
      // Waiting for spread images to load
      return
    }

    // 単ページモードの場合は通常の画像サイズが必要
    if (!isSpread && (!imageSize.width || !imageSize.height)) {
      // Waiting for single image to load
      return
    }

    const newScale = calculateFitScale()
    setScale(newScale)

    // Center the image with the new scale
    const container = containerRef.current
    // Centering image with fit mode
    const centerPos = centerImage(
      container.clientWidth,
      container.clientHeight,
      imageSize.width,
      imageSize.height,
      newScale,
      rotation,
      isSpread
    )
    // Position updated from fit mode
    setPosition(centerPos)
  }, [calculateFitScale, imageSize, spreadImageSizes, rotation, isSpread, centerImage, viewMode])

  // Handle image load
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const newImageSize = { width: img.naturalWidth, height: img.naturalHeight }

    if (isSpread && spreadPages.left && spreadPages.right) {
      // 見開きモードの場合：どちらの画像がロードされたかを判定
      const imgSrc = img.src
      const leftSrc = getImageSrc(spreadPages.left)
      const rightSrc = getImageSrc(spreadPages.right)

      if (imgSrc === leftSrc) {
        // 左側の画像
        setSpreadImageSizes(prev => ({ ...prev, left: newImageSize }))
      } else if (imgSrc === rightSrc) {
        // 右側の画像
        setSpreadImageSizes(prev => ({ ...prev, right: newImageSize }))
      }

      // 両方の画像がロード完了した場合のみ中央配置を実行
      const updatedSizes = {
        left: imgSrc === leftSrc ? newImageSize : spreadImageSizes.left,
        right: imgSrc === rightSrc ? newImageSize : spreadImageSizes.right
      }

      if (containerRef.current && updatedSizes.left && updatedSizes.right) {
        const newScale = calculateFitScale()
        setScale(newScale)

        const container = containerRef.current
        // Centering spread images on load
        const centerPos = centerImage(
          container.clientWidth,
          container.clientHeight,
          0, // 見開きモードでは使用されない
          0, // 見開きモードでは使用されない
          newScale,
          rotation,
          true // useSpreadDims
        )
        // Position updated from spread load
        setPosition(centerPos)
      }
    } else {
      // 単ページモード
      setImageSize(newImageSize)

      // Auto-center the image after loading
      if (containerRef.current && newImageSize.width > 0 && newImageSize.height > 0) {
        const newScale = calculateFitScale()
        setScale(newScale)

        const container = containerRef.current
        // Centering single image on load
        const centerPos = centerImage(
          container.clientWidth,
          container.clientHeight,
          newImageSize.width,
          newImageSize.height,
          newScale,
          rotation,
          false // useSpreadDims
        )
        // Position updated from single image load
        setPosition(centerPos)
      }
    }
  }, [calculateFitScale, rotation, isSpread, centerImage, spreadPages, spreadImageSizes])

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()

    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.1, Math.min(10, scale * delta))

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const centerX = (e.clientX - rect.left - rect.width / 2) / scale
      const centerY = (e.clientY - rect.top - rect.height / 2) / scale

      const scaleDiff = newScale - scale
      setPosition({
        x: position.x - centerX * scaleDiff,
        y: position.y - centerY * scaleDiff
      })
    }

    setScale(newScale)
  }, [scale, position])

  // Handle mouse down for dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }, [position])

  // Handle mouse move for dragging
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return

    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }, [isDragging, dragStart])

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Fit mode buttons
  const handleFitToWindow = () => setFitMode('fit')
  const handleFitToWidth = () => setFitMode('width')
  const handleActualSize = () => setFitMode('actual')

  // Rotation
  const handleRotateLeft = () => setRotation((prev) => prev - 90)
  const handleRotateRight = () => setRotation((prev) => prev + 90)

  // Zoom controls
  const handleZoomIn = () => setScale((prev) => Math.min(10, prev * 1.2))
  const handleZoomOut = () => setScale((prev) => Math.max(0.1, prev / 1.2))

  const imageStyle = {
    transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
    cursor: isDragging ? 'grabbing' : 'grab',
    transformOrigin: 'top left', // 修正：左上原点で計算結果を正確に反映
    position: 'absolute', // 絶対配置でflexboxの影響を排除
    top: 0,
    left: 0
  }

  // Image style calculated

  // 表示するファイル名（見開き時は両ページ）
  const displayName = isSpread
    ? `${spreadPages.left!.name} | ${spreadPages.right!.name}`
    : file.name

  return (
    <div className="viewer-container">
      {/* Image Controls */}
      <div className="absolute top-4 left-4 z-10 bg-black bg-opacity-50 rounded-lg p-2 flex space-x-2">
        <button
          onClick={handleFitToWindow}
          className={`px-2 py-1 text-xs rounded ${fitMode === 'fit' ? 'bg-blue-600' : 'bg-gray-600 hover:bg-gray-500'} text-white transition-colors`}
          title="ウィンドウに合わせる"
        >
          ウィンドウ
        </button>
        <button
          onClick={handleFitToWidth}
          className={`px-2 py-1 text-xs rounded ${fitMode === 'width' ? 'bg-blue-600' : 'bg-gray-600 hover:bg-gray-500'} text-white transition-colors`}
          title="幅に合わせる"
        >
          幅
        </button>
        <button
          onClick={handleActualSize}
          className={`px-2 py-1 text-xs rounded ${fitMode === 'actual' ? 'bg-blue-600' : 'bg-gray-600 hover:bg-gray-500'} text-white transition-colors`}
          title="実際のサイズ"
        >
          100%
        </button>
      </div>

      {/* Zoom and Rotation Controls */}
      <div className="absolute top-4 right-4 z-10 bg-black bg-opacity-50 rounded-lg p-2 flex space-x-2">
        <button
          onClick={handleZoomOut}
          className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500 text-white transition-colors"
          title="縮小"
        >
          🔍-
        </button>
        <span className="px-2 py-1 text-xs text-white">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={handleZoomIn}
          className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500 text-white transition-colors"
          title="拡大"
        >
          🔍+
        </button>
        <div className="w-px bg-gray-500" />
        <button
          onClick={handleRotateLeft}
          className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500 text-white transition-colors"
          title="左回転"
        >
          ↶
        </button>
        <button
          onClick={handleRotateRight}
          className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500 text-white transition-colors"
          title="右回転"
        >
          ↷
        </button>
      </div>

      {/* Image Container */}
      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden cursor-move"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          /* flexbox自動中央配置を無効化してJavaScript制御に委ねる */
          display: 'block',
          position: 'relative'
        }}
      >
        {isSpread ? (
          // 見開き表示
          <div
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
              cursor: isDragging ? 'grabbing' : 'grab',
              transformOrigin: 'top left', // 修正：左上原点で計算結果を正確に反映
              position: 'absolute', // 絶対配置でflexboxの影響を排除
              top: 0,
              left: 0,
              display: 'flex', // 見開き内部の画像配置用
              alignItems: 'flex-start', // 画像を上端揃えで配置
              justifyContent: 'flex-start' // 画像を左端から配置
            }}
          >
            <img
              src={getImageSrc(spreadPages.left!)}
              alt={spreadPages.left!.name}
              className="max-w-none select-none block"
              style={{
                maxHeight: '100vh', // 最大高さをビューポート高さに制限
                width: 'auto', // 縦横比を保持して幅を自動計算
                height: 'auto' // 縦横比を保持
              }}
              onLoad={handleImageLoad}
              onError={(e) => {
                console.error('Failed to load image:', spreadPages.left!.path, e)
              }}
              draggable={false}
            />
            <img
              src={getImageSrc(spreadPages.right!)}
              alt={spreadPages.right!.name}
              className="max-w-none select-none block"
              style={{
                maxHeight: '100vh', // 最大高さをビューポート高さに制限
                width: 'auto', // 縦横比を保持して幅を自動計算
                height: 'auto' // 縦横比を保持
              }}
              onLoad={handleImageLoad}
              onError={(e) => {
                console.error('Failed to load image:', spreadPages.right!.path, e)
              }}
              draggable={false}
            />
          </div>
        ) : (
          // 単ページ表示
          <img
            ref={imageRef}
            src={getImageSrc(file)}
            alt={file.name}
            className="select-none"
            style={{
              ...imageStyle,
              maxWidth: 'none', // Tailwindのmax-w-noneをインラインで置換
              display: 'block'
            }}
            onLoad={handleImageLoad}
            onError={(e) => {
              console.error('Failed to load image:', file.path, e)
            }}
            draggable={false}
          />
        )}
      </div>

      {/* Image Info */}
      <div className="absolute bottom-4 left-4 z-10 bg-black bg-opacity-50 rounded-lg p-2 text-xs text-white">
        <div>{displayName}</div>
        {isSpread ? (
          spreadImageSizes.left && spreadImageSizes.right && (
            <div>
              {spreadImageSizes.left.width + spreadImageSizes.right.width} × {Math.max(spreadImageSizes.left.height, spreadImageSizes.right.height)}
            </div>
          )
        ) : (
          imageSize.width > 0 && imageSize.height > 0 && (
            <div>{imageSize.width} × {imageSize.height}</div>
          )
        )}
      </div>
    </div>
  )
}
