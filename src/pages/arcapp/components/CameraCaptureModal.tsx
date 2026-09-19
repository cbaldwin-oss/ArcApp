import { useEffect, useRef, useState } from 'react'
import FullscreenOverlay from './FullscreenOverlay'
import type { JointPackSide } from '../../../lib/api'

type Props = {
  title: string
  sides: JointPackSide[]
  /** Sides already logged (have a Drive URL) — shown as done, still re-shootable. */
  existing: Partial<Record<JointPackSide, string>>
  /** Sides captured this session, not yet saved — shown as a thumbnail on their tab. */
  pending: Partial<Record<JointPackSide, string>>
  onCapture: (side: JointPackSide, dataUrl: string) => void
  onClose: () => void
}

const MAX_DIM = 1600
const QUALITY = 0.82

/**
 * A live camera feed inside the app itself (getUserMedia + canvas snapshot) instead of handing
 * off to the OS camera app per photo — lets a crew member shoot Top, tap "Side", shoot Side, tap
 * "Bottom", shoot Bottom, all in one continuous session without leaving ArcApp three times.
 */
export default function CameraCaptureModal({ title, sides, existing, pending, onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [activeSide, setActiveSide] = useState<JointPackSide>(
    sides.find((s) => !existing[s] && !pending[s]) ?? sides[0],
  )
  const [cameraError, setCameraError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("This browser doesn't support in-page camera capture — use the file picker instead.")
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setReady(true)
        }
      } catch (err) {
        setCameraError(err instanceof Error ? err.message : 'Could not open the camera.')
      }
    }
    void start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const scale = Math.min(1, MAX_DIM / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    onCapture(activeSide, canvas.toDataURL('image/jpeg', QUALITY))

    // Auto-advance to whichever side still needs a shot, so a full pass needs no extra taps.
    const stillNeeded = sides.filter((s) => s !== activeSide && !pending[s] && !existing[s])
    if (stillNeeded.length) setActiveSide(stillNeeded[0])
  }

  return (
    <FullscreenOverlay title={title} onClose={onClose}>
      <div className="camera-side-tabs">
        {sides.map((side) => {
          const isDone = !!pending[side] || !!existing[side]
          return (
            <button
              key={side}
              type="button"
              className={`camera-side-tab${activeSide === side ? ' active' : ''}${isDone ? ' done' : ''}`}
              onClick={() => setActiveSide(side)}
            >
              {pending[side] && <img src={pending[side]} className="camera-thumb" alt="" />}
              {side}
              {isDone && !pending[side] ? ' ✓' : ''}
            </button>
          )
        })}
      </div>

      {cameraError ? (
        <div className="table-error" style={{ textAlign: 'center' }}>
          {cameraError}
        </div>
      ) : (
        <>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} className="camera-video" playsInline muted />
          <div className="camera-shutter-row">
            <button type="button" className="camera-shutter-btn" disabled={!ready} onClick={capture} aria-label={`Capture ${activeSide}`} />
          </div>
        </>
      )}

      <div className="q-hint" style={{ textAlign: 'center', marginTop: 14 }}>
        {cameraError ? '' : (
          <>
            Shooting <b style={{ color: 'var(--text)' }}>{activeSide}</b> for {title}
            {pending[activeSide] ? ' — tap the shutter again to retake, or pick another side above.' : '.'}
          </>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
        <button className="wf-btn" onClick={onClose}>
          Done — Back to Save
        </button>
      </div>
    </FullscreenOverlay>
  )
}
