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

  // 見開きモード時の実際の合計サイズを取得
  const getSpreadDimensions = useCallback(() => {
    if (!isSpread || !spreadImageSizes.left || !spreadImageSizes.right) {
      return null
    }

    const totalWidth = spreadImageSizes.left.width + spreadImageSizes.right.width
    const maxHeight = Math.max(spreadImageSizes.left.height, spreadImageSizes.right.height)

    return { width: totalWidth, height: maxHeight }
  }, [isSpread, spreadImageSizes])

  // Reset view when file changes
  useEffect(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setRotation(0)
    setFitMode('fit')
    setSpreadImageSizes({ left: null, right: null })
  }, [file.path])

  // Calculate fit scale based on container and image size
  const calculateFitScale = useCallback(() => {
    if (!containerRef.current) return 1

    const container = containerRef.current
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    // 見開きモードの場合は見開きサイズを使用
    if (isSpread) {
      const spreadDims = getSpreadDimensions()
      if (!spreadDims) return 1

      const scaleX = containerWidth / spreadDims.width
      const scaleY = containerHeight / spreadDims.height

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
  }, [imageSize, fitMode, isSpread, getSpreadDimensions])

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
    let targetWidth = imageWidth
    let targetHeight = imageHeight

    // 見開きモードの場合は実際の見開きサイズを使用
    if (useSpreadDims) {
      const spreadDims = getSpreadDimensions()
      if (spreadDims) {
        targetWidth = spreadDims.width
        targetHeight = spreadDims.height
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
  }, [getSpreadDimensions])

  // Apply fit mode
  useEffect(() => {
    if (!containerRef.current) return

    // 見開きモードの場合は両方の画像がロードされるまで待つ
    if (isSpread && (!spreadImageSizes.left || !spreadImageSizes.right)) return

    // 単ページモードの場合は通常の画像サイズが必要
    if (!isSpread && (!imageSize.width || !imageSize.height)) return

    const newScale = calculateFitScale()
    setScale(newScale)

    // Center the image with the new scale
    const container = containerRef.current
    const centerPos = centerImage(
      container.clientWidth,
      container.clientHeight,
      imageSize.width,
      imageSize.height,
      newScale,
      rotation,
      isSpread
    )
    setPosition(centerPos)
  }, [calculateFitScale, imageSize, spreadImageSizes, rotation, isSpread, centerImage])

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
        const centerPos = centerImage(
          container.clientWidth,
          container.clientHeight,
          0, // 見開きモードでは使用されない
          0, // 見開きモードでは使用されない
          newScale,
          rotation,
          true // useSpreadDims
        )
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
        const centerPos = centerImage(
          container.clientWidth,
          container.clientHeight,
          newImageSize.width,
          newImageSize.height,
          newScale,
          rotation,
          false // useSpreadDims
        )
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
    cursor: isDragging ? 'grabbing' : 'grab'
  }

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
        className="w-full h-full flex items-center justify-center overflow-hidden cursor-move"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {isSpread ? (
          // 見開き表示
          <div
            className="flex items-center justify-center h-full"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
          >
            <img
              src={getImageSrc(spreadPages.left!)}
              alt={spreadPages.left!.name}
              className="max-w-none select-none h-full object-contain"
              onLoad={handleImageLoad}
              onError={(e) => {
                console.error('Failed to load image:', spreadPages.left!.path, e)
              }}
              draggable={false}
            />
            <img
              src={getImageSrc(spreadPages.right!)}
              alt={spreadPages.right!.name}
              className="max-w-none select-none h-full object-contain"
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
            className="max-w-none select-none"
            style={imageStyle}
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
