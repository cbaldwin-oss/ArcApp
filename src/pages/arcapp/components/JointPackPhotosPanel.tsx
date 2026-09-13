import { Camera, FolderOpen, ExternalLink } from 'lucide-react'

type Props = {
  folder: string
  driveReady: boolean
  canEdit: boolean
  onLogPhotos: () => void
  onGoToSettings: () => void
}

export default function JointPackPhotosPanel({ folder, driveReady, canEdit, onLogPhotos, onGoToSettings }: Props) {
  const hasFolder = folder.trim().length > 0

  return (
    <section className="panel" id="jointpacks">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Joint Pack Photos</h2>
          <span className={driveReady ? 'conn-pill ready' : 'conn-pill loading'}>
            <span className={driveReady ? 'led' : 'led amber'} /> {driveReady ? 'Drive Ready' : 'Drive Pending'}
          </span>
        </div>
      </div>
      <div className="panel-body">
        <div className="form-field" style={{ maxWidth: 560 }}>
          <label>Logging destination (Google Drive folder)</label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: hasFolder ? 'var(--text)' : 'var(--text-faint)',
              background: 'var(--bg-elev-2)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
            }}
          >
            <FolderOpen style={{ width: 15, height: 15, flex: '0 0 auto', color: 'var(--green)' }} />
            {hasFolder ? folder : 'No destination set yet.'}
          </div>
        </div>

        {!hasFolder && (
          <div className="q-hint">
            Set a destination folder in{' '}
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a style={{ color: 'var(--green-soft)', cursor: 'pointer' }} onClick={onGoToSettings}>
              Settings
            </a>{' '}
            before logging Joint Pack photos.
          </div>
        )}

        <button
          className="photo-log-btn"
          type="button"
          style={{ maxWidth: 320, marginTop: 6 }}
          disabled={!driveReady || !hasFolder || !canEdit}
          onClick={onLogPhotos}
        >
          <Camera />
          Log Joint Pack Photos
        </button>

        <div className="q-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {driveReady ? (
            <>
              <ExternalLink style={{ width: 12, height: 12 }} />
              Photos are uploaded into the destination folder above.
            </>
          ) : (
            'Uploading turns on once the "ArcApp Connections" Google Drive resource is connected.'
          )}
        </div>
      </div>
    </section>
  )
}
