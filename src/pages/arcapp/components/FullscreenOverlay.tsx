import { useEffect } from 'react'
import type { ReactNode } from 'react'

type Props = {
  title: string
  onClose: () => void
  children: ReactNode
}

export default function FullscreenOverlay({ title, onClose, children }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fs-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fs-panel">
        <div className="fs-header">
          <h2>{title}</h2>
          <button className="fs-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="fs-body">{children}</div>
      </div>
    </div>
  )
}
