import { useEffect } from 'react'
import { createPortal } from 'react-dom'
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

  const overlay = (
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

  // Portaled to the `.arcapp` root (not rendered in place) because callers mount this from deep
  // inside <main>, which has its own `position:relative; z-index:1` — a stacking context that
  // would otherwise trap this overlay's z-index:100 locally, rendering it BEHIND the sidebar
  // (z-index:30, a sibling of <main>) wherever the two visually overlap on screen. Still inside
  // `.arcapp` so its `.arcapp .fs-overlay` etc. CSS selectors keep matching.
  const root = document.querySelector('.arcapp') ?? document.body
  return createPortal(overlay, root)
}
