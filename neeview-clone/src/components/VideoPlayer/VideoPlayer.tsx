import React, { useRef, useState, useEffect } from 'react'
import { MediaFile } from '../../App'

interface VideoPlayerProps {
  file: MediaFile
}

export function VideoPlayer({ file }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showControls, setShowControls] = useState(true)
  const [videoSrc, setVideoSrc] = useState<string>('')
  const [error, setError] = useState<string>('')

  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Reset when file changes
  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setError('')

    // Convert file path to proper URL for Electron
    const convertFilePathToUrl = (filePath: string): string => {
      try {
        // Handle Windows paths
        const normalizedPath = filePath.replace(/\\/g, '/')
        // Use custom safe-file protocol for local files in Electron
        const url = normalizedPath.startsWith('safe-file:') ? normalizedPath : `safe-file:${normalizedPath}`
        return url
      } catch (err) {
        console.error('Error converting file path to URL:', err)
        return filePath
      }
    }

    setVideoSrc(convertFilePathToUrl(file.path))
  }, [file.path])

  // Update current time
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const updateTime = () => setCurrentTime(video.currentTime)
    const updateDuration = () => setDuration(video.duration)

    video.addEventListener('timeupdate', updateTime)
    video.addEventListener('loadedmetadata', updateDuration)
    video.addEventListener('durationchange', updateDuration)

    return () => {
      video.removeEventListener('timeupdate', updateTime)
      video.removeEventListener('loadedmetadata', updateDuration)
      video.removeEventListener('durationchange', updateDuration)
    }
  }, [])

  // Auto-hide controls
  useEffect(() => {
    const resetHideTimeout = () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current)
      }
      setShowControls(true)
      hideControlsTimeoutRef.current = setTimeout(() => {
        if (isPlaying) {
          setShowControls(false)
        }
      }, 3000)
    }

    resetHideTimeout()

    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current)
      }
    }
  }, [isPlaying])

  const togglePlay = async () => {
    const video = videoRef.current

    if (!video) {
      console.error('Video element not found')
      return
    }

    try {
      if (isPlaying) {
        video.pause()
        setIsPlaying(false)
      } else {
        await video.play()
        setIsPlaying(true)
      }
    } catch (error) {
      console.error('Error toggling video playback:', error)
      setError(`再生エラー: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return

    const time = parseFloat(e.target.value)
    video.currentTime = time
    setCurrentTime(time)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return

    const vol = parseFloat(e.target.value)
    video.volume = vol
    setVolume(vol)
    setIsMuted(vol === 0)
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return

    if (isMuted) {
      video.volume = volume
      setIsMuted(false)
    } else {
      video.volume = 0
      setIsMuted(true)
    }
  }

  const handlePlaybackRateChange = (rate: number) => {
    const video = videoRef.current
    if (!video) return

    video.playbackRate = rate
    setPlaybackRate(rate)
  }

  const skipTime = (seconds: number) => {
    const video = videoRef.current
    if (!video) return

    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + seconds))
  }

  const formatTime = (time: number) => {
    const hours = Math.floor(time / 3600)
    const minutes = Math.floor((time % 3600) / 60)
    const seconds = Math.floor(time % 60)

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const handleMouseMove = () => {
    setShowControls(true)
  }

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!videoRef.current) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowUp':
          e.preventDefault()
          handleVolumeChange({ target: { value: Math.min(1, volume + 0.1).toString() } } as any)
          break
        case 'ArrowDown':
          e.preventDefault()
          handleVolumeChange({ target: { value: Math.max(0, volume - 0.1).toString() } } as any)
          break
        case 'f':
          e.preventDefault()
          // Toggle fullscreen (would need additional implementation)
          break
        case 'm':
          e.preventDefault()
          toggleMute()
          break
        case ',':
          e.preventDefault()
          skipTime(-10)
          break
        case '.':
          e.preventDefault()
          skipTime(10)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [volume, isPlaying])

  return (
    <div className="viewer-container relative" onMouseMove={handleMouseMove}>
      <video
        ref={videoRef}
        src={videoSrc}
        className="w-full h-full object-contain"
        controls={false}
        preload="metadata"
        onPlay={() => {
          setIsPlaying(true)
        }}
        onPause={() => {
          setIsPlaying(false)
        }}
        onError={(e) => {
          console.error('Failed to load video:', file.path, e)
          setError(`動画の読み込みに失敗しました: ${file.name}`)
        }}
        onLoadedData={() => {
          setError('')
        }}
      />

      {/* Video Controls */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
          {/* Progress Bar */}
          <div className="mb-4">
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentTime / (duration || 1)) * 100}%, #6b7280 ${(currentTime / (duration || 1)) * 100}%, #6b7280 100%)`
              }}
            />
          </div>

          <div className="flex items-center justify-between text-white">
            {/* Left Controls */}
            <div className="flex items-center space-x-4">
              <button
                onClick={togglePlay}
                className="text-2xl hover:scale-110 transition-transform"
                title={isPlaying ? '一時停止 (Space)' : '再生 (Space)'}
              >
                {isPlaying ? '⏸️' : '▶️'}
              </button>

              <button
                onClick={() => skipTime(-10)}
                className="text-xl hover:scale-110 transition-transform"
                title="10秒戻る (,)"
              >
                ⏪
              </button>

              <button
                onClick={() => skipTime(10)}
                className="text-xl hover:scale-110 transition-transform"
                title="10秒進む (.)"
              >
                ⏩
              </button>

              {/* Volume Control */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={toggleMute}
                  className="text-xl hover:scale-110 transition-transform"
                  title={isMuted ? '音量オン (M)' : '音量オフ (M)'}
                >
                  {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Time Display */}
              <div className="text-sm">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center space-x-4">
              {/* Playback Speed */}
              <div className="flex items-center space-x-1">
                <span className="text-sm">速度:</span>
                <select
                  value={playbackRate}
                  onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                  className="bg-gray-800 text-white text-sm rounded px-1 border border-gray-600"
                >
                  <option value={0.25}>0.25x</option>
                  <option value={0.5}>0.5x</option>
                  <option value={0.75}>0.75x</option>
                  <option value={1}>1x</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2}>2x</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Large Play Button Overlay */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-25">
          <button
            onClick={togglePlay}
            className="text-8xl text-white hover:scale-110 transition-transform bg-black bg-opacity-75 rounded-full p-8 shadow-lg"
            title="動画を再生 (Space)"
          >
            ▶️
          </button>
        </div>
      )}

      {/* Click overlay for pause/play */}
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={togglePlay}
        style={{ zIndex: showControls ? -1 : 1 }}
      />

      {/* Error Message */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
          <div className="text-center text-white">
            <div className="text-6xl mb-4">❌</div>
            <div className="text-xl mb-2">動画の読み込みエラー</div>
            <div className="text-sm mb-2">{error}</div>
            <div className="text-xs text-gray-400">
              対応形式: MP4, AVI, MKV, MOV, WMV, FLV, WebM
            </div>
          </div>
        </div>
      )}

      {/* Video Info */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-50 rounded-lg p-2 text-xs text-white">
        <div>{file.name}</div>
        {videoSrc && (
          <div className="text-xs text-gray-300 mt-1">
            URL: {videoSrc.length > 50 ? '...' + videoSrc.slice(-50) : videoSrc}
          </div>
        )}
      </div>
    </div>
  )
}