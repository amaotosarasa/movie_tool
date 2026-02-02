import React, { useState, useRef, useCallback, useEffect } from 'react'
import { MediaFile } from '../../App'

interface ImageViewerProps {
  file: MediaFile
}

export function ImageViewer({ file }: ImageViewerProps) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [fitMode, setFitMode] = useState<'fit' | 'width' | 'actual'>('fit')
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [rotation, setRotation] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  // Reset view when file changes
  useEffect(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setRotation(0)
    setFitMode('fit')
  }, [file.path])

  // Calculate fit scale based on container and image size
  const calculateFitScale = useCallback(() => {
    if (!containerRef.current || !imageSize.width || !imageSize.height) return 1

    const container = containerRef.current
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    const scaleX = containerWidth / imageSize.width
    const scaleY = containerHeight / imageSize.height

    switch (fitMode) {
      case 'fit':
        return Math.min(scaleX, scaleY, 1) // Don't scale up beyond 100%
      case 'width':
        return scaleX
      case 'actual':
        return 1
      default:
        return 1
    }
  }, [imageSize, fitMode])

  // Apply fit mode
  useEffect(() => {
    const newScale = calculateFitScale()
    setScale(newScale)
    setPosition({ x: 0, y: 0 }) // Center image
  }, [calculateFitScale])

  // Handle image load
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
  }

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()

    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.1, Math.min(10, scale * delta))

    // Calculate zoom center
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
        <img
          ref={imageRef}
          src={file.path.startsWith('safe-file:') ? file.path : `safe-file:${file.path.replace(/\\/g, '/')}`}
          alt={file.name}
          className="max-w-none select-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            cursor: isDragging ? 'grabbing' : 'grab'
          }}
          onLoad={handleImageLoad}
          onError={(e) => {
            console.error('Failed to load image:', file.path, e)
          }}
          draggable={false}
        />
      </div>

      {/* Image Info */}
      <div className="absolute bottom-4 left-4 z-10 bg-black bg-opacity-50 rounded-lg p-2 text-xs text-white">
        <div>{file.name}</div>
        {imageSize.width > 0 && imageSize.height > 0 && (
          <div>{imageSize.width} × {imageSize.height}</div>
        )}
      </div>
    </div>
  )
}