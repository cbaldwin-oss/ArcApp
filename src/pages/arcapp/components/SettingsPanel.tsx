import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import WorkflowsBuilder from './WorkflowsBuilder'
import CxAlloyStatusPicker from './CxAlloyStatusPicker'
import AuthorizedUsersManager from './AuthorizedUsersManager'
import SubmittalExemptAssetsManager from './SubmittalExemptAssetsManager'
import { hasCapability } from '../../../lib/project'

type Props = {
  jointPackFolder: string
  checklistReadyStatuses: string[]
  issueReviewStatuses: string[]
  submittalExemptAssets: string[]
  checklistTodoEnabled: boolean
  issueTodoEnabled: boolean
  checklistOpenStatuses: string[]
  issueOpenStatuses: string[]
  netaSubmissionsTodoEnabled: boolean
  netaReturnedTodoEnabled: boolean
  cxAlloyLinkBaseDetected: { domain: string; projectId: string } | null
  cxalloyLinkBaseOverride: string
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

function ToggleField({
  label,
  hint,
  initial,
  canEdit,
  loading,
  onSave,
}: {
  label: string
  hint: string
  initial: boolean
  canEdit: boolean
  loading: boolean
  onSave: (value: boolean) => Promise<void>
}) {
  const [value, setValue] = useState(initial)
  const [msg, setMsg] = useState<{ text: string; cls: string }>({ text: '', cls: 'q-hint' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setValue(initial)
  }, [initial])

  const disabled = !canEdit || busy || loading

  async function toggle() {
    if (disabled) return
    const next = !value
    setValue(next)
    setBusy(true)
    setMsg({ text: 'Saving…', cls: 'q-hint' })
    try {
      await onSave(next)
      setMsg({ text: 'Saved app-wide.', cls: 'q-hint ok' })
    } catch (err) {
      setValue(!next)
      setMsg({ text: 'Failed: ' + (err instanceof Error ? err.message : String(err)), cls: 'q-hint err' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <label className="wf-check-row" style={{ cursor: disabled ? 'default' : 'pointer' }}>
        <input type="checkbox" checked={value} disabled={disabled} onChange={toggle} />
        {label}
      </label>
      <div className="q-hint">{hint}</div>
      {msg.text && <div className={msg.cls}>{msg.text}</div>}
    </div>
  )
}

export default function SettingsPanel({
  jointPackFolder,
  checklistReadyStatuses,
  issueReviewStatuses,
  submittalExemptAssets,
  checklistTodoEnabled,
  issueTodoEnabled,
  checklistOpenStatuses,
  issueOpenStatuses,
  netaSubmissionsTodoEnabled,
  netaReturnedTodoEnabled,
  cxAlloyLinkBaseDetected,
  cxalloyLinkBaseOverride,
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
          label="CxAlloy project override — domain/project id"
          hint={
            `Format: domain/projectId, e.g. google.cxalloy.com/70. Checklist/Issue deep links use this ` +
            `to build their URL. Auto-detected from this project's Equipment Tracker data by default ` +
            (cxAlloyLinkBaseDetected
              ? `(currently detected: ${cxAlloyLinkBaseDetected.domain}/${cxAlloyLinkBaseDetected.projectId}) — leave blank to keep using that.`
              : `— nothing detected yet for this project (no Equipment Tracker data synced, or none of it has a link field). Set this manually until it does.`)
          }
          initial={cxalloyLinkBaseOverride}
          canEdit={canEdit}
          loading={loading}
          onSave={(v) => onSaveSetting('cxalloy_link_base_override', v)}
        />
        <Field
          label="Joint Pack Photos — Google Drive destination folder ID"
          hint="Open the destination folder in Drive and copy the ID from its URL (.../folders/<THIS PART>). Must be a folder the Joint Pack Apps Script's account can write to."
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

        <div style={{ marginBottom: 22, maxWidth: 560 }}>
          <label style={{ display: 'block', marginBottom: 4, fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--text)' }}>
            Checklist &amp; Issue To-Do
          </label>
          <div className="q-hint" style={{ marginBottom: 12 }}>
            Surfaces still-open Checklists/Issues on the To-Do page as assignable instances — each
            can be handed to a team or a specific person, individually or via multi-select, same as
            a regular task.
          </div>
          <ToggleField
            label="Checklist To-Do"
            hint="Shows an Open Checklists section on the To-Do page."
            initial={checklistTodoEnabled}
            canEdit={canEdit}
            loading={loading}
            onSave={(v) => onSaveSetting('checklist_todo_enabled', v ? 'true' : '')}
          />
          <CxAlloyStatusPicker
            label="Checklist To-Do — status(es) that count as still open"
            hint="Pulled live from the CxAlloy Settings tab. Different from Checklist Ready above — this is 'still outstanding', not 'ready for CxA review'. Nothing shows on the To-Do page until at least one status is checked here."
            column="checklistStatuses"
            value={checklistOpenStatuses}
            canEdit={canEdit}
            loading={loading}
            onSave={(values) => onSaveSetting('checklist_open_statuses', values.join(', '))}
          />
          <ToggleField
            label="Issues To-Do"
            hint="Shows an Open Issues section on the To-Do page."
            initial={issueTodoEnabled}
            canEdit={canEdit}
            loading={loading}
            onSave={(v) => onSaveSetting('issue_todo_enabled', v ? 'true' : '')}
          />
          <CxAlloyStatusPicker
            label="Issues To-Do — status(es) that count as still open"
            hint="Pulled live from the CxAlloy Settings tab. Different from Issues for Review above — this is 'still outstanding', not 'ready for review'. Nothing shows on the To-Do page until at least one status is checked here."
            column="issueStatuses"
            value={issueOpenStatuses}
            canEdit={canEdit}
            loading={loading}
            onSave={(values) => onSaveSetting('issue_open_statuses', values.join(', '))}
          />
        </div>

        {hasCapability('netaTracker') && (
          <div style={{ marginBottom: 22, maxWidth: 560 }}>
            <label style={{ display: 'block', marginBottom: 4, fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--text)' }}>
              NETA Tracker To-Do
            </label>
            <div className="q-hint" style={{ marginBottom: 12 }}>
              Surfaces still-open NETA Tracker documents on the To-Do page as assignable instances,
              same as Checklist/Issue To-Do above. "Still open" isn't configurable here — it's the
              same not-yet-completed definition the NETA Tracker page itself uses (Submissions: not
              yet Submitted to Google; Returned Files: not yet Uploaded to ACC).
            </div>
            <ToggleField
              label="NETA Submissions To-Do"
              hint="Shows an Open NETA Submissions section on the To-Do page."
              initial={netaSubmissionsTodoEnabled}
              canEdit={canEdit}
              loading={loading}
              onSave={(v) => onSaveSetting('neta_submissions_todo_enabled', v ? 'true' : '')}
            />
            <ToggleField
              label="NETA Returned Files To-Do"
              hint="Shows an Open NETA Returned Files section on the To-Do page."
              initial={netaReturnedTodoEnabled}
              canEdit={canEdit}
              loading={loading}
              onSave={(v) => onSaveSetting('neta_returned_todo_enabled', v ? 'true' : '')}
            />
          </div>
        )}

        <WorkflowsBuilder canEdit={canManageWorkflows} canEditItems={canEdit} />

        <SubmittalExemptAssetsManager
          value={submittalExemptAssets}
          canEdit={canEdit}
          loading={loading}
          onSave={(values) => onSaveSetting('submittal_exempt_assets', values.join(', '))}
        />

        <AuthorizedUsersManager canEdit={canEdit} />
      </div>
    </section>
  )
}
