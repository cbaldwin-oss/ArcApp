import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import WorkflowsBuilder from './WorkflowsBuilder'
import CxAlloyStatusPicker from './CxAlloyStatusPicker'
import AuthorizedUsersManager from './AuthorizedUsersManager'
import SubmittalExemptAssetsManager from './SubmittalExemptAssetsManager'
import DefaultAssigneePicker from './DefaultAssigneePicker'
import type { DefaultAssignee } from '../../../lib/api'
import type { Team } from '../types'

type Props = {
  jointPackFolder: string
  netaTrackerEnabled: boolean
  checklistReadyStatuses: string[]
  issueReviewStatuses: string[]
  submittalExemptAssets: string[]
  checklistTodoEnabled: boolean
  issueTodoEnabled: boolean
  netaSubmissionsTodoEnabled: boolean
  netaReturnedTodoEnabled: boolean
  checklistDefaultAssignee: DefaultAssignee
  issueDefaultAssignee: DefaultAssignee
  netaSubmissionsDefaultAssignee: DefaultAssignee
  netaReturnedDefaultAssignee: DefaultAssignee
  teams: Team[]
  cxAlloyLinkBaseDetected: { domain: string; projectId: string } | null
  cxalloyLinkBaseOverride: string
  /** Broader than isAdmin — any signed-in, authorized ArcApp user. Only used here for Workflows
   * (item catalog + building workflows), which isn't admin-restricted. */
  canEdit: boolean
  /** From arcapp_authorized_users.role === 'admin' — every other field on this page requires this,
   * not just canEdit. Settings is specifically an admin-only page; editors can see it (so they
   * know what's configured) but every control is disabled for them. */
  isAdmin: boolean
  /** Separate, looser gate for Workflows specifically — see Dashboard.tsx for why. */
  canManageWorkflows: boolean
  loading: boolean
  onSaveSetting: (key: string, value: string) => Promise<void>
  onSaveDefaultAssignee: (prefix: string, result: DefaultAssignee) => Promise<void>
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
      <div className={msg.cls}>{msg.text || (!canEdit ? 'Only admins can change settings.' : '')}</div>
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
  netaTrackerEnabled,
  checklistReadyStatuses,
  issueReviewStatuses,
  submittalExemptAssets,
  checklistTodoEnabled,
  issueTodoEnabled,
  netaSubmissionsTodoEnabled,
  netaReturnedTodoEnabled,
  checklistDefaultAssignee,
  issueDefaultAssignee,
  netaSubmissionsDefaultAssignee,
  netaReturnedDefaultAssignee,
  teams,
  cxAlloyLinkBaseDetected,
  cxalloyLinkBaseOverride,
  canEdit,
  isAdmin,
  canManageWorkflows,
  loading,
  onSaveSetting,
  onSaveDefaultAssignee,
}: Props) {
  return (
    <section className="panel" id="settings">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Settings</h2>
          <span className="panel-count">app-wide</span>
        </div>
      </div>
      {!isAdmin && (
        <div className="q-hint" style={{ padding: '0 20px 12px' }}>
          You can see how this project is configured, but only an admin can change it.
        </div>
      )}
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
          canEdit={isAdmin}
          loading={loading}
          onSave={(v) => onSaveSetting('cxalloy_link_base_override', v)}
        />
        <Field
          label="Joint Pack Photos — Google Drive destination folder ID"
          hint="Open the destination folder in Drive and copy the ID from its URL (.../folders/<THIS PART>). Must be a folder the Joint Pack Apps Script's account can write to."
          initial={jointPackFolder}
          canEdit={isAdmin}
          loading={loading}
          onSave={(v) => onSaveSetting('joint_pack_photos_folder', v)}
        />
        <CxAlloyStatusPicker
          label="Checklist Ready — status(es) that count as ready for CxA review"
          hint="Pulled live from the CxAlloy Settings tab (STY4A API Database). Checked statuses show up on the Checklists page. Also defines Checklist To-Do below: any status NOT checked here counts as still open."
          column="checklistStatuses"
          value={checklistReadyStatuses}
          canEdit={isAdmin}
          loading={loading}
          onSave={(values) => onSaveSetting('checklist_ready_statuses', values.join(', '))}
        />
        <CxAlloyStatusPicker
          label="Issues for Review — status(es) that count as ready for review"
          hint="Pulled live from the CxAlloy Settings tab (STY4A API Database). Checked statuses show up on the Issues page. Also defines Issues To-Do below: any status NOT checked here counts as still open."
          column="issueStatuses"
          value={issueReviewStatuses}
          canEdit={isAdmin}
          loading={loading}
          onSave={(values) => onSaveSetting('issue_review_statuses', values.join(', '))}
        />

        <div style={{ marginBottom: 22, maxWidth: 560 }}>
          <label style={{ display: 'block', marginBottom: 4, fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--text)' }}>
            Checklist &amp; Issue To-Do
          </label>
          <div className="q-hint" style={{ marginBottom: 12 }}>
            Powers the "Your To-Dos" widget's Checklist/Issue markers — a default-assignee summary
            card below, plus any individually-assigned item still shows in "My Tasks". Doesn't add a
            browsable list to the To-Do page itself; the real items live on the Checklists/Issues
            pages.
          </div>
          <ToggleField
            label="Checklist To-Do"
            hint="Turns on the Checklists default-assignee summary card and My Tasks entries below."
            initial={checklistTodoEnabled}
            canEdit={isAdmin}
            loading={loading}
            onSave={(v) => onSaveSetting('checklist_todo_enabled', v ? 'true' : '')}
          />
          <DefaultAssigneePicker
            label="Checklists — default assignee"
            hint="When set and at least one checklist is ready for review (per Checklist Ready above), this team/person gets a single 'Checklists need to be reviewed' card in Your To-Dos, linking to the Checklists page."
            value={checklistDefaultAssignee}
            teams={teams}
            canEdit={isAdmin}
            loading={loading}
            onSave={(v) => onSaveDefaultAssignee('checklist_default_assignee', v)}
          />
          <ToggleField
            label="Issues To-Do"
            hint="Turns on the Issues default-assignee summary card and My Tasks entries below."
            initial={issueTodoEnabled}
            canEdit={isAdmin}
            loading={loading}
            onSave={(v) => onSaveSetting('issue_todo_enabled', v ? 'true' : '')}
          />
          <DefaultAssigneePicker
            label="Issues — default assignee"
            hint="When set and at least one issue is ready for review (per Issues for Review above), this team/person gets a single 'Issues need to be reviewed' card in Your To-Dos, linking to the Issues page."
            value={issueDefaultAssignee}
            teams={teams}
            canEdit={isAdmin}
            loading={loading}
            onSave={(v) => onSaveDefaultAssignee('issue_default_assignee', v)}
          />
        </div>

        <div style={{ marginBottom: 22, maxWidth: 560 }}>
          <label style={{ display: 'block', marginBottom: 4, fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--text)' }}>
            NETA Tracker
          </label>
          <ToggleField
            label="NETA Tracker enabled for this project"
            hint="Turns on the NETA Tracker page, its Sidebar nav item, and the To-Do settings below. Requires this project's own NETA Sheet + Apps Script to already be deployed (see README) — turning this on before that's ready shows a clean 'not wired up yet' error instead of breaking anything."
            initial={netaTrackerEnabled}
            canEdit={isAdmin}
            loading={loading}
            onSave={(v) => onSaveSetting('neta_tracker_enabled', v ? 'true' : '')}
          />
          {netaTrackerEnabled && (
            <>
              <div className="q-hint" style={{ marginTop: 12, marginBottom: 12 }}>
                Same idea as Checklist/Issue To-Do above, for the NETA Tracker's two tabs. "Still
                open" isn't configurable here — it's the same not-yet-completed definition the NETA
                Tracker page itself uses (Submissions: not yet Submitted to Google; Returned Files:
                not yet Uploaded to ACC).
              </div>
              <ToggleField
                label="NETA Submissions To-Do"
                hint="Turns on the NETA Submissions default-assignee summary card and My Tasks entries below."
                initial={netaSubmissionsTodoEnabled}
                canEdit={isAdmin}
                loading={loading}
                onSave={(v) => onSaveSetting('neta_submissions_todo_enabled', v ? 'true' : '')}
              />
              <DefaultAssigneePicker
                label="NETA Submissions — default assignee"
                hint="When set and at least one submission is still open, this team/person gets a single 'NETA Submissions need to be reviewed' card in Your To-Dos, linking to the NETA Tracker page."
                value={netaSubmissionsDefaultAssignee}
                teams={teams}
                canEdit={isAdmin}
                loading={loading}
                onSave={(v) => onSaveDefaultAssignee('neta_submissions_default_assignee', v)}
              />
              <ToggleField
                label="NETA Returned Files To-Do"
                hint="Turns on the NETA Returned Files default-assignee summary card and My Tasks entries below."
                initial={netaReturnedTodoEnabled}
                canEdit={isAdmin}
                loading={loading}
                onSave={(v) => onSaveSetting('neta_returned_todo_enabled', v ? 'true' : '')}
              />
              <DefaultAssigneePicker
                label="NETA Returned Files — default assignee"
                hint="When set and at least one returned file is still open, this team/person gets a single 'NETA Returned Files need to be reviewed' card in Your To-Dos, linking to the NETA Tracker page."
                value={netaReturnedDefaultAssignee}
                teams={teams}
                canEdit={isAdmin}
                loading={loading}
                onSave={(v) => onSaveDefaultAssignee('neta_returned_default_assignee', v)}
              />
            </>
          )}
        </div>

        <WorkflowsBuilder canEdit={canManageWorkflows} canEditItems={canEdit} />

        <SubmittalExemptAssetsManager
          value={submittalExemptAssets}
          canEdit={isAdmin}
          loading={loading}
          onSave={(values) => onSaveSetting('submittal_exempt_assets', values.join(', '))}
        />

        <AuthorizedUsersManager canEdit={isAdmin} />
      </div>
    </section>
  )
}
