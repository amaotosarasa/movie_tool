import { useMemo } from 'react'
import { MediaFile } from '../../App'

interface FileListProps {
  files: MediaFile[]
  currentIndex: number
  onFileSelect: (file: MediaFile, index: number) => void
}

export function FileList({ files, currentIndex, onFileSelect }: FileListProps) {
  const getFileIcon = useMemo(() => (file: MediaFile): string => {
    switch (file.type) {
      case 'image':
        return '🖼️'
      case 'video':
        return '🎬'
      default:
        return '📄'
    }
  }, [])

  const formatFileSize = useMemo(() => (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }, [])

  const formatDate = useMemo(() => (date: Date): string => {
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }, [])

  if (files.length === 0) {
    return (
      <div className="sidebar">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-gray-300">ファイルリスト</h2>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="text-2xl mb-2">📂</div>
            <div className="text-xs">ファイルがありません</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-gray-300">ファイルリスト</h2>
        <div className="text-xs text-gray-500 mt-1">
          {files.length} ファイル
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {files.map((file, index) => (
          <div
            key={file.path}
            className={`file-item ${index === currentIndex ? 'selected' : ''}`}
            onClick={() => onFileSelect(file, index)}
            title={`${file.path}\n更新: ${formatDate(file.modified)}\nサイズ: ${formatFileSize(file.size)}`}
          >
            <div className="flex items-center space-x-2">
              <span className="text-lg flex-shrink-0">{getFileIcon(file)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate font-medium">
                  {file.name}
                </div>
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <span>{formatFileSize(file.size)}</span>
                  <span>•</span>
                  <span>{formatDate(file.modified)}</span>
                </div>
              </div>
              {index === currentIndex && (
                <span className="text-blue-400 flex-shrink-0">▶</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="p-2 border-t border-gray-700">
        <div className="text-xs text-gray-500">
          {currentIndex + 1} / {files.length}
        </div>
      </div>
    </div>
  )
}