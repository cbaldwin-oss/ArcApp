import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import type { DefaultAssignee } from '../../../lib/api'
import type { Team } from '../types'

type Mode = 'none' | 'team' | 'person'

function modeOf(value: DefaultAssignee): Mode {
  if (value.teamId) return 'team'
  if (value.email || value.name) return 'person'
  return 'none'
}

type Props = {
  label: string
  hint: string
  value: DefaultAssignee
  teams: Team[]
  canEdit: boolean
  loading: boolean
  onSave: (value: DefaultAssignee) => Promise<void>
}

/**
 * Inline "team or person" picker for a Settings-level default assignee — same at-most-one-of
 * team-or-person shape as AssignPopover (used for individual Checklist/Issue/task assignment),
 * but rendered inline (no popover/portal) since Settings has no anchor row to position against.
 */
export default function DefaultAssigneePicker({ label, hint, value, teams, canEdit, loading, onSave }: Props) {
  const [mode, setMode] = useState<Mode>(() => modeOf(value))
  const [teamId, setTeamId] = useState(value.teamId ?? '')
  const [personName, setPersonName] = useState(value.name ?? '')
  const [personEmail, setPersonEmail] = useState(value.email ?? '')
  const [msg, setMsg] = useState<{ text: string; cls: string }>({ text: '', cls: 'q-hint' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setMode(modeOf(value))
    setTeamId(value.teamId ?? '')
    setPersonName(value.name ?? '')
    setPersonEmail(value.email ?? '')
  }, [value])

  const dirty =
    mode !== modeOf(value) ||
    (mode === 'team' && teamId !== (value.teamId ?? '')) ||
    (mode === 'person' && (personName.trim() !== (value.name ?? '') || personEmail.trim() !== (value.email ?? '')))
  const disabled = !canEdit || busy || loading

  async function save() {
    if (mode === 'team' && !teamId) {
      setMsg({ text: 'Pick a team, or switch to No default.', cls: 'q-hint err' })
      return
    }
    if (mode === 'person' && !personName.trim()) {
      setMsg({ text: 'Enter a name for the default person.', cls: 'q-hint err' })
      return
    }
    setBusy(true)
    setMsg({ text: 'Saving…', cls: 'q-hint' })
    try {
      await onSave({
        teamId: mode === 'team' ? teamId : null,
        name: mode === 'person' ? personName.trim() : null,
        email: mode === 'person' ? personEmail.trim() : null,
      })
      setMsg({ text: 'Saved.', cls: 'q-hint ok' })
    } catch (err) {
      setMsg({ text: 'Failed: ' + (err instanceof Error ? err.message : String(err)), cls: 'q-hint err' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: 18, maxWidth: 560 }}>
      <label style={{ display: 'block', marginBottom: 8 }}>{label}</label>
      <div className="wf-check-grid" style={{ marginBottom: 8 }}>
        <label className="wf-check-row">
          <input type="radio" name={`${label}-mode`} checked={mode === 'none'} disabled={disabled} onChange={() => setMode('none')} />
          No default
        </label>
        <label className="wf-check-row">
          <input type="radio" name={`${label}-mode`} checked={mode === 'team'} disabled={disabled} onChange={() => setMode('team')} />
          A team
        </label>
        <label className="wf-check-row">
          <input type="radio" name={`${label}-mode`} checked={mode === 'person'} disabled={disabled} onChange={() => setMode('person')} />
          A specific person
        </label>
      </div>
      {mode === 'team' && (
        <select value={teamId} disabled={disabled} onChange={(e) => setTeamId(e.target.value)} style={{ marginBottom: 8 }}>
          <option value="">— Select a team —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {mode === 'person' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
          <input type="text" placeholder="Name" value={personName} disabled={disabled} onChange={(e) => setPersonName(e.target.value)} />
          <input type="email" placeholder="Email (optional)" value={personEmail} disabled={disabled} onChange={(e) => setPersonEmail(e.target.value)} />
        </div>
      )}
      <button
        className="seal-submit-btn"
        type="button"
        style={{ maxWidth: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}
        disabled={disabled || !dirty}
        onClick={save}
      >
        <Save style={{ width: 15, height: 15 }} />
        Save
      </button>
      <div className="q-hint">{hint}</div>
      {msg.text && <div className={msg.cls}>{msg.text}</div>}
      {!canEdit && !msg.text && <div className="q-hint">Only admins can change settings.</div>}
    </div>
  )
}
