import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Team } from '../types'

export type AssignResult = { teamId: string | null; email: string | null; name: string | null }
type AssignMode = 'none' | 'team' | 'person'

type Props = {
  top: number
  left: number
  teams: Team[]
  /** How many items this assignment will apply to — shown in the popover's title. */
  itemCount: number
  initial?: AssignResult
  onApply: (result: AssignResult) => void
  onClose: () => void
}

function modeOf(initial: AssignResult | undefined): AssignMode {
  if (!initial) return 'none'
  if (initial.teamId) return 'team'
  if (initial.email || initial.name) return 'person'
  return 'none'
}

/**
 * Shared team-or-person assignment popover — used both for a single row's "reassign" chip and
 * the multi-select toolbar's "Assign selected" button (itemCount tells them apart). Mirrors
 * TodoPage's own inline add/edit form assignment fields (same radio + team-select + name/email
 * inputs) so this feels like the same assignment system, just reachable from Checklists/Issues.
 */
export default function AssignPopover({ top, left, teams, itemCount, initial, onApply, onClose }: Props) {
  const [mode, setMode] = useState<AssignMode>(() => modeOf(initial))
  const [teamId, setTeamId] = useState(initial?.teamId ?? '')
  const [personName, setPersonName] = useState(initial?.name ?? '')
  const [personEmail, setPersonEmail] = useState(initial?.email ?? '')
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [onClose])

  function apply() {
    if (mode === 'team' && !teamId) {
      setError('Pick a team, or switch to Unassigned/Person.')
      return
    }
    if (mode === 'person' && !personName.trim()) {
      setError('Enter a name for the person this is assigned to.')
      return
    }
    onApply({
      teamId: mode === 'team' ? teamId : null,
      name: mode === 'person' ? personName.trim() : null,
      email: mode === 'person' ? personEmail.trim() : null,
    })
  }

  const popover = (
    <div className="oi-popover" style={{ top, left }} ref={ref}>
      <div className="oi-popover-title">Assign {itemCount > 1 ? `${itemCount} items` : 'item'} to</div>
      <div className="wf-check-grid" style={{ marginBottom: 8 }}>
        <label className="wf-check-row">
          <input type="radio" name="oi-assign-mode" checked={mode === 'none'} onChange={() => setMode('none')} />
          Unassigned
        </label>
        <label className="wf-check-row">
          <input type="radio" name="oi-assign-mode" checked={mode === 'team'} onChange={() => setMode('team')} />
          A team
        </label>
        <label className="wf-check-row">
          <input type="radio" name="oi-assign-mode" checked={mode === 'person'} onChange={() => setMode('person')} />
          A specific person
        </label>
      </div>

      {mode === 'team' && (
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">— Select a team —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {mode === 'person' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="text" placeholder="Name" value={personName} onChange={(e) => setPersonName(e.target.value)} />
          <input type="email" placeholder="Email (optional)" value={personEmail} onChange={(e) => setPersonEmail(e.target.value)} />
        </div>
      )}

      {error && <div className="q-hint err">{error}</div>}

      <div className="oi-popover-actions">
        <button type="button" className="eq-filter-btn clear" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="eq-filter-btn" onClick={apply}>
          Apply
        </button>
      </div>
    </div>
  )

  return createPortal(popover, document.querySelector('.arcapp') ?? document.body)
}
