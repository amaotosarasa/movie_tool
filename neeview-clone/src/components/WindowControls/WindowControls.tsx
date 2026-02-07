
export function WindowControls() {
  const handleMinimize = () => {
    window.api.minimizeWindow()
  }

  const handleMaximize = () => {
    window.api.maximizeWindow()
  }

  const handleClose = () => {
    window.api.closeWindow()
  }

  return (
    <div className="window-controls">
      <button
        onClick={handleMinimize}
        className="window-control-btn"
        title="最小化"
      >
        🗕
      </button>
      <button
        onClick={handleMaximize}
        className="window-control-btn"
        title="最大化/復元"
      >
        🗖
      </button>
      <button
        onClick={handleClose}
        className="window-control-btn close"
        title="閉じる"
      >
        🗙
      </button>
    </div>
  )
}