import React, { useState } from 'react'
import { MediaFile } from '../../App'

interface ToolbarProps {
  onOpenFile: () => void
  onOpenFolder: () => void
  onPrevious: () => void
  onNext: () => void
  onToggleSidebar: () => void
  onSortChange: (sortBy: 'name' | 'date' | 'size' | 'type', sortOrder?: 'asc' | 'desc') => void
  onToggleSubfolders: () => void
  canGoNext: boolean
  canGoPrevious: boolean
  currentFile: MediaFile | null
  currentFolder: string | null
  isLoading: boolean
  sortBy: 'name' | 'date' | 'size' | 'type'
  sortOrder: 'asc' | 'desc'
  includeSubfolders: boolean
  fileCount: number
}

export function Toolbar({
  onOpenFile,
  onOpenFolder,
  onPrevious,
  onNext,
  onToggleSidebar,
  onSortChange,
  onToggleSubfolders,
  canGoNext,
  canGoPrevious,
  currentFile,
  currentFolder,
  isLoading,
  sortBy,
  sortOrder,
  includeSubfolders,
  fileCount
}: ToolbarProps) {
  const [showSortMenu, setShowSortMenu] = useState(false)
  const getSortIcon = (type: 'name' | 'date' | 'size' | 'type') => {
    if (sortBy !== type) return ''
    return sortOrder === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className="toolbar">
      <div className="flex items-center space-x-2">
        <button
          onClick={onOpenFile}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm transition-colors"
          title="ファイルを開く (Ctrl+O)"
          disabled={isLoading}
        >
          📁 ファイル
        </button>

        <button
          onClick={onOpenFolder}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-white text-sm transition-colors"
          title="フォルダを開く (Ctrl+Shift+O)"
          disabled={isLoading}
        >
          📂 フォルダ
        </button>

        <div className="w-px h-6 bg-gray-600" />

        <button
          onClick={onPrevious}
          disabled={!canGoPrevious || isLoading}
          className="px-2 py-1 hover:bg-gray-700 rounded text-white disabled:text-gray-500 disabled:hover:bg-transparent transition-colors"
          title="前のファイル (←)"
        >
          ⬅️
        </button>

        <button
          onClick={onNext}
          disabled={!canGoNext || isLoading}
          className="px-2 py-1 hover:bg-gray-700 rounded text-white disabled:text-gray-500 disabled:hover:bg-transparent transition-colors"
          title="次のファイル (→)"
        >
          ➡️
        </button>

        <div className="w-px h-6 bg-gray-600" />

        {currentFolder && (
          <>
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="px-2 py-1 hover:bg-gray-700 rounded text-white transition-colors"
                title="ソート設定"
              >
                🔄
              </button>

              {showSortMenu && (
                <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg z-50 min-w-40">
                  <div className="p-2">
                    <div className="text-xs text-gray-400 mb-2">ソート順</div>
                    <button
                      onClick={() => {onSortChange('name'); setShowSortMenu(false)}}
                      className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-700 rounded"
                    >
                      名前{getSortIcon('name')}
                    </button>
                    <button
                      onClick={() => {onSortChange('date'); setShowSortMenu(false)}}
                      className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-700 rounded"
                    >
                      更新日{getSortIcon('date')}
                    </button>
                    <button
                      onClick={() => {onSortChange('size'); setShowSortMenu(false)}}
                      className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-700 rounded"
                    >
                      サイズ{getSortIcon('size')}
                    </button>
                    <button
                      onClick={() => {onSortChange('type'); setShowSortMenu(false)}}
                      className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-700 rounded"
                    >
                      種類{getSortIcon('type')}
                    </button>
                    <div className="border-t border-gray-600 mt-2 pt-2">
                      <label className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={includeSubfolders}
                          onChange={onToggleSubfolders}
                          className="rounded"
                        />
                        <span>サブフォルダ含む</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <button
          onClick={onToggleSidebar}
          className="px-2 py-1 hover:bg-gray-700 rounded text-white transition-colors"
          title="サイドバー切替 (Tab)"
        >
          📋
        </button>

        {isLoading && (
          <div className="flex items-center space-x-1 text-yellow-400">
            <span className="animate-spin">⏳</span>
            <span className="text-xs">読み込み中...</span>
          </div>
        )}
      </div>

      <div className="flex-1 flex justify-center items-center">
        <div className="text-center">
          {currentFile && (
            <div className="text-sm text-gray-300 truncate max-w-md" title={currentFile.path}>
              {currentFile.name}
            </div>
          )}
          {currentFolder && (
            <div className="text-xs text-gray-500 truncate max-w-md" title={currentFolder}>
              📂 {currentFolder} ({fileCount} ファイル)
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2 text-xs text-gray-400">
        <span>NeeView Clone v1.0</span>
      </div>
    </div>
  )
}