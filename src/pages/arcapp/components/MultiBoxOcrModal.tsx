import { useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { uploadAssetPhoto, ocrAssetImage } from '../../../lib/api'
import FullscreenOverlay from './FullscreenOverlay'

type Entry = { key: string; display: string }
type Box = { id: string; key: string; display: string; leftPct: number; topPct: number; widthPct: number; heightPct: number }
type Rect = { x: number; y: number; w: number; h: number }

type Props = {
  assetName: string
  groupName: string
  entries: Entry[]
  onApply: (results: Array<{ key: string; text: string }>) => void
  onClose: () => void
}

const PADDING = 60

function collides(rect: Rect, obstacles: Rect[], boundsW: number, boundsH: number): boolean {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > boundsW || rect.y + rect.h > boundsH) return true
  return obstacles.some(
    (o) => rect.x < o.x + o.w && rect.x + rect.w > o.x && rect.y < o.y + o.h && rect.y + rect.h > o.y,
  )
}

/**
 * Ported from LaunchPad's Asset Attributes "Scan Photo" flow: take one photo of a nameplate, draw
 * a box per attribute you can read off it, OCR each box separately, drop the recognized text into
 * that attribute. The annotated full photo (boxes + labels burned in) also gets saved to Drive as
 * a reference image via the same `saveImageOnly` action LaunchPad already uses.
 */
export default function MultiBoxOcrModal({ assetName, groupName, entries, onApply, onClose }: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const imgElRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [boxes, setBoxes] = useState<Box[]>([])
  const [activeAttr, setActiveAttr] = useState<Entry | null>(null)
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  const [processing, setProcessing] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  function handleFile(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => setImgSrc((e.target?.result as string) ?? null)
    reader.readAsDataURL(file)
  }

  function pointerPos(e: React.PointerEvent): { x: number; y: number } | null {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height))
    return { x, y }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!activeAttr) return // nothing selected — let the page scroll/pan normally
    const pos = pointerPos(e)
    if (!pos) return
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setDraft({ x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y })
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!draft) return
    const pos = pointerPos(e)
    if (!pos) return
    e.preventDefault()
    setDraft((d) => (d ? { ...d, x1: pos.x, y1: pos.y } : d))
  }
  function onPointerUp() {
    if (!draft || !activeAttr || !containerRef.current) {
      setDraft(null)
      return
    }
    const rect = containerRef.current.getBoundingClientRect()
    const left = Math.min(draft.x0, draft.x1)
    const top = Math.min(draft.y0, draft.y1)
    const w = Math.abs(draft.x1 - draft.x0)
    const h = Math.abs(draft.y1 - draft.y0)
    if (w > 10 && h > 10) {
      setBoxes((prev) => [
        ...prev,
        {
          id: `box_${Date.now()}`,
          key: activeAttr.key,
          display: activeAttr.display,
          leftPct: left / rect.width,
          topPct: top / rect.height,
          widthPct: w / rect.width,
          heightPct: h / rect.height,
        },
      ])
      setActiveAttr(null)
    }
    setDraft(null)
  }

  function removeBox(id: string) {
    setBoxes((prev) => prev.filter((b) => b.id !== id))
  }
  function clearBoxes() {
    setBoxes([])
  }

  async function processAndRead() {
    const img = imgElRef.current
    if (!img || boxes.length === 0) {
      setError('Draw at least one box first.')
      return
    }
    setProcessing(true)
    setError('')
    setStatus('Saving full photo…')
    try {
      const nw = img.naturalWidth
      const nh = img.naturalHeight

      // 1. Build one annotated copy of the full photo (boxes + labels burned in) as a Drive
      // reference image — labels are placed to avoid overlapping the boxes or each other.
      const canvasFull = document.createElement('canvas')
      canvasFull.width = nw
      canvasFull.height = nh
      const ctxFull = canvasFull.getContext('2d')
      if (!ctxFull) throw new Error('Canvas not supported on this device.')
      ctxFull.drawImage(img, 0, 0, nw, nh)

      const lineW = Math.max(3, nw * 0.003)
      const fontSize = Math.max(12, nw * 0.008)
      ctxFull.lineWidth = lineW
      ctxFull.font = `bold ${fontSize}px Arial`

      const obstacles: Rect[] = []
      const boxesData = boxes.map((b) => ({
        display: b.display,
        x: nw * b.leftPct,
        y: nh * b.topPct,
        w: nw * b.widthPct,
        h: nh * b.heightPct,
      }))

      boxesData.forEach((b) => {
        ctxFull.strokeStyle = '#00e676'
        ctxFull.strokeRect(b.x, b.y, b.w, b.h)
        ctxFull.fillStyle = 'rgba(0, 230, 118, 0.2)'
        ctxFull.fillRect(b.x, b.y, b.w, b.h)
        obstacles.push({ x: b.x, y: b.y, w: b.w, h: b.h })
      })

      boxesData.forEach((b) => {
        const textWidth = ctxFull.measureText(b.display).width
        const padding = fontSize * 0.4
        const labelW = textWidth + padding * 2
        const labelH = fontSize + padding * 2
        const gap = lineW + 2

        const candidates: Array<{ x: number; y: number }> = [
          { x: b.x, y: b.y - labelH - gap },
          { x: b.x, y: b.y + b.h + gap },
          { x: b.x + b.w + gap, y: b.y },
          { x: b.x - labelW - gap, y: b.y },
          { x: b.x + b.w - labelW, y: b.y - labelH - gap },
          { x: b.x + b.w - labelW, y: b.y + b.h + gap },
        ]
        let chosen = candidates.find((pos) => !collides({ x: pos.x, y: pos.y, w: labelW, h: labelH }, obstacles, nw, nh))
        if (!chosen) {
          let clampedY = b.y - labelH - gap
          if (clampedY < 0) clampedY = b.y + b.h + gap
          if (clampedY + labelH > nh) clampedY = Math.max(0, b.y - labelH)
          let clampedX = b.x
          if (clampedX + labelW > nw) clampedX = nw - labelW
          if (clampedX < 0) clampedX = 0
          chosen = { x: clampedX, y: clampedY }
        }
        obstacles.push({ x: chosen.x, y: chosen.y, w: labelW, h: labelH })

        ctxFull.fillStyle = '#00e676'
        ctxFull.fillRect(chosen.x, chosen.y, labelW, labelH)
        ctxFull.fillStyle = '#000000'
        ctxFull.textBaseline = 'top'
        ctxFull.fillText(b.display, chosen.x + padding, chosen.y + padding)
      })

      const fullBase64 = canvasFull.toDataURL('image/jpeg', 0.85)
      const scanType = Array.from(new Set(boxes.map((b) => b.display))).slice(0, 3).join('_') || 'Scan'

      let photoName = 'Failed_To_Save_Image'
      try {
        const uploaded = await uploadAssetPhoto({ assetName, scanType, imageBase64: fullBase64 })
        photoName = uploaded.fileName || photoName
      } catch (err) {
        // Non-fatal — the reference keeps going and still attempts OCR even if the drive save failed.
        console.error('Failed to save full image:', err)
      }

      setStatus(`Processing ${boxes.length} box${boxes.length === 1 ? '' : 'es'}…`)

      const results = await Promise.all(
        boxes.map(async (box) => {
          const sx = nw * box.leftPct
          const sy = nh * box.topPct
          const sw = nw * box.widthPct
          const sh = nh * box.heightPct

          const canvasBox = document.createElement('canvas')
          canvasBox.width = sw + PADDING * 2
          canvasBox.height = sh + PADDING * 2
          const ctxBox = canvasBox.getContext('2d')
          if (!ctxBox) return { key: box.key, text: '' }
          ctxBox.fillStyle = '#ffffff'
          ctxBox.fillRect(0, 0, canvasBox.width, canvasBox.height)
          ctxBox.filter = 'contrast(1.2)'
          ctxBox.drawImage(img, sx, sy, sw, sh, PADDING, PADDING, sw, sh)

          const croppedBase64 = canvasBox.toDataURL('image/jpeg', 1.0)
          try {
            const { text } = await ocrAssetImage({ assetName, attributeName: box.display, photoName, imageBase64: croppedBase64 })
            return { key: box.key, text }
          } catch (err) {
            console.error(`OCR error on ${box.display}:`, err)
            return { key: box.key, text: '' }
          }
        }),
      )

      const successful = results.filter((r) => r.text)
      onApply(successful)
      setStatus(`Processed ${successful.length} of ${boxes.length} value${boxes.length === 1 ? '' : 's'}.`)
    } catch (err) {
      setError('Processing failed: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <FullscreenOverlay title={`Scan Photo — ${groupName}`} onClose={onClose}>
      {!imgSrc ? (
        <div className="ocr-capture-card">
          <p className="ocr-capture-title">Take a clear photo of the {groupName} nameplate</p>
          <label className="ocr-capture-btn">
            <Camera style={{ width: 18, height: 18 }} />
            Open Native Camera
            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
          </label>
          <p className="q-hint" style={{ marginTop: 12, marginBottom: 0 }}>
            Your device&apos;s native camera guarantees the best focus and resolution.
          </p>
        </div>
      ) : (
        <>
          <div className="ocr-toolbar">
            <div className="q-hint" style={{ width: '100%', margin: '0 0 6px' }}>
              1. Select an attribute below, 2. draw a box around it on the photo.
            </div>
            {entries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={`ocr-attr-btn${activeAttr?.key === entry.key ? ' active' : ''}${boxes.some((b) => b.key === entry.key) ? ' done' : ''}`}
                onClick={() => setActiveAttr(entry)}
              >
                {entry.display}
              </button>
            ))}
          </div>
          <p className="q-hint" style={{ textAlign: 'center', color: 'var(--green-soft)' }}>
            {activeAttr ? `Draw a box for: ${activeAttr.display}` : 'Select an attribute above to draw its box.'}
          </p>

          <div
            className="ocr-crop-container"
            ref={containerRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDraft(null)}
            style={{ touchAction: activeAttr ? 'none' : 'auto', cursor: activeAttr ? 'crosshair' : 'default' }}
          >
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <img ref={imgElRef} src={imgSrc} className="ocr-crop-img" draggable={false} />
            {boxes.map((b) => (
              <div
                key={b.id}
                className="ocr-box"
                style={{ left: `${b.leftPct * 100}%`, top: `${b.topPct * 100}%`, width: `${b.widthPct * 100}%`, height: `${b.heightPct * 100}%` }}
              >
                <span className="ocr-box-label">
                  {b.display}
                  <button type="button" className="ocr-box-remove" title="Remove this box" onClick={() => removeBox(b.id)}>
                    <X style={{ width: 10, height: 10 }} />
                  </button>
                </span>
              </div>
            ))}
            {draft && (
              <div
                className="ocr-draft-box"
                style={{
                  left: Math.min(draft.x0, draft.x1),
                  top: Math.min(draft.y0, draft.y1),
                  width: Math.abs(draft.x1 - draft.x0),
                  height: Math.abs(draft.y1 - draft.y0),
                }}
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="wf-btn danger" disabled={processing || boxes.length === 0} onClick={clearBoxes}>
              Clear Boxes
            </button>
            <button
              className="seal-submit-btn"
              style={{ maxWidth: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              disabled={processing || boxes.length === 0}
              onClick={processAndRead}
            >
              <Camera style={{ width: 15, height: 15 }} />
              {processing ? 'Processing…' : `Process ${boxes.length} Box${boxes.length === 1 ? '' : 'es'}`}
            </button>
            <button className="wf-btn" disabled={processing} onClick={() => setImgSrc(null)}>
              Retake Photo
            </button>
            {status && <span className="q-hint ok">{status}</span>}
            {error && <span className="q-hint err">{error}</span>}
          </div>
        </>
      )}
    </FullscreenOverlay>
  )
}
