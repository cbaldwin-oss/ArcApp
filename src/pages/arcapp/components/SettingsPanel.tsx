import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import WorkflowsBuilder from './WorkflowsBuilder'
import CxAlloyStatusPicker from './CxAlloyStatusPicker'

type Props = {
  jointPackFolder: string
  checklistReadyStatuses: string[]
  issueReviewStatuses: string[]
  canEdit: boolean
  /** Separate, looser gate for Workflows specifically — see Dashboard.tsx for why. */
  canManageWorkflows: boolean
  loading: boolean
  onSaveSetting: (key: string, value: string) => Promise<void>
}

function Field({
  label,
  hint,
  initial,
  canEdit,
  loading,
  onSave,
}: {
  label: string
  hint: string
  initial: string
  canEdit: boolean
  loading: boolean
  onSave: (value: string) => Promise<void>
}) {
  const [value, setValue] = useState(initial)
  const [msg, setMsg] = useState<{ text: string; cls: string }>({ text: '', cls: 'q-hint' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setValue(initial)
  }, [initial])

  const dirty = value.trim() !== initial.trim()
  const disabled = !canEdit || busy || loading

  async function save() {
    if (disabled) return
    setBusy(true)
    setMsg({ text: 'Saving…', cls: 'q-hint' })
    try {
      await onSave(value.trim())
      setMsg({ text: 'Saved app-wide.', cls: 'q-hint ok' })
    } catch (err) {
      setMsg({ text: 'Failed: ' + (err instanceof Error ? err.message : String(err)), cls: 'q-hint err' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: 22, maxWidth: 560 }}>
      <div className="form-field" style={{ marginBottom: 6 }}>
        <label>{label}</label>
        <input type="text" value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} />
      </div>
      <div className="q-hint">{hint}</div>
      <button
        className="seal-submit-btn"
        type="button"
        style={{ maxWidth: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}
        disabled={disabled || !dirty}
        onClick={save}
      >
        <Save style={{ width: 15, height: 15 }} />
        Save
      </button>
      <div className={msg.cls}>{msg.text || (!canEdit ? 'Only authorized editors can change settings.' : '')}</div>
    </div>
  )
}

export default function SettingsPanel({
  jointPackFolder,
  checklistReadyStatuses,
  issueReviewStatuses,
  canEdit,
  canManageWorkflows,
  loading,
  onSaveSetting,
}: Props) {
  return (
    <section className="panel" id="settings">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Settings</h2>
          <span className="panel-count">app-wide</span>
        </div>
      </div>
      <div className="panel-body">
        <Field
          label="Joint Pack Photos — Google Drive destination folder"
          hint="Folder name, path, or Drive folder ID."
          initial={jointPackFolder}
          canEdit={canEdit}
          loading={loading}
          onSave={(v) => onSaveSetting('joint_pack_photos_folder', v)}
        />
        <CxAlloyStatusPicker
          label="Checklist Ready — status(es) that count as ready for CxA review"
          hint="Pulled live from the CxAlloy Settings tab (STY4A API Database). Checked statuses show up on the Checklists page."
          column="checklistStatuses"
          value={checklistReadyStatuses}
          canEdit={canEdit}
          loading={loading}
          onSave={(values) => onSaveSetting('checklist_ready_statuses', values.join(', '))}
        />
        <CxAlloyStatusPicker
          label="Issues for Review — status(es) that count as ready for review"
          hint="Pulled live from the CxAlloy Settings tab (STY4A API Database). Checked statuses show up on the Issues page."
          column="issueStatuses"
          value={issueReviewStatuses}
          canEdit={canEdit}
          loading={loading}
          onSave={(values) => onSaveSetting('issue_review_statuses', values.join(', '))}
        />

        <WorkflowsBuilder canEdit={canManageWorkflows} canEditItems={canEdit} />
      </div>
    </section>
  )
}
