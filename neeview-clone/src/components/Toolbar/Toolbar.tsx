import React from 'react'
import { MediaFile } from '../../App'

interface ToolbarProps {
  onOpenFile: () => void
  onPrevious: () => void
  onNext: () => void
  onToggleSidebar: () => void
  canGoNext: boolean
  canGoPrevious: boolean
  currentFile: MediaFile | null
}

export function Toolbar({
  onOpenFile,
  onPrevious,
  onNext,
  onToggleSidebar,
  canGoNext,
  canGoPrevious,
  currentFile
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="flex items-center space-x-2">
        <button
          onClick={onOpenFile}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm transition-colors"
          title="ファイルを開く (Ctrl+O)"
        >
          📁 開く
        </button>

        <div className="w-px h-6 bg-gray-600" />

        <button
          onClick={onPrevious}
          disabled={!canGoPrevious}
          className="px-2 py-1 hover:bg-gray-700 rounded text-white disabled:text-gray-500 disabled:hover:bg-transparent transition-colors"
          title="前のファイル (←)"
        >
          ⬅️
        </button>

        <button
          onClick={onNext}
          disabled={!canGoNext}
          className="px-2 py-1 hover:bg-gray-700 rounded text-white disabled:text-gray-500 disabled:hover:bg-transparent transition-colors"
          title="次のファイル (→)"
        >
          ➡️
        </button>

        <div className="w-px h-6 bg-gray-600" />

        <button
          onClick={onToggleSidebar}
          className="px-2 py-1 hover:bg-gray-700 rounded text-white transition-colors"
          title="サイドバー切替 (Tab)"
        >
          📋
        </button>
      </div>

      <div className="flex-1 flex justify-center items-center">
        {currentFile && (
          <span className="text-sm text-gray-300 truncate max-w-md" title={currentFile.path}>
            {currentFile.name}
          </span>
        )}
      </div>

      <div className="flex items-center space-x-2 text-xs text-gray-400">
        <span>NeeView Clone v1.0</span>
      </div>
    </div>
  )
}