import { useState } from 'react'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import type { Team, TeamMember, Todo } from '../types'

type Props = {
  teams: Team[]
  /** Used only to warn (not block — a deleted team's tasks just fall back to unassigned) how many tasks reference a team. */
  tasks: Todo[]
  onSave: (input: { id?: string; name: string; members: TeamMember[] }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

type FormState = { name: string; members: TeamMember[] }
const EMPTY_FORM: FormState = { name: '', members: [] }

export default function TeamsManager({ teams, tasks, onSave, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const usageCount = (teamId: string) => tasks.filter((t) => t.assignedTeamId === teamId).length

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setFormOpen(true)
  }
  function openEdit(team: Team) {
    setEditingId(team.id)
    setForm({ name: team.name, members: team.members.map((m) => ({ ...m })) })
    setFormError('')
    setFormOpen(true)
  }
  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setFormError('')
  }

  function addMemberRow() {
    setForm((f) => ({ ...f, members: [...f.members, { name: '', email: '' }] }))
  }
  function updateMember(idx: number, patch: Partial<TeamMember>) {
    setForm((f) => ({ ...f, members: f.members.map((m, i) => (i === idx ? { ...m, ...patch } : m)) }))
  }
  function removeMember(idx: number) {
    setForm((f) => ({ ...f, members: f.members.filter((_, i) => i !== idx) }))
  }

  async function save() {
    const name = form.name.trim()
    if (!name) {
      setFormError('A team name is required.')
      return
    }
    const members = form.members.filter((m) => m.name.trim())
    setSaving(true)
    setFormError('')
    try {
      await onSave({ id: editingId ?? undefined, name, members })
      closeForm()
    } catch (err) {
      setFormError('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete(id: string) {
    setSaving(true)
    try {
      await onDelete(id)
      setDeleteId(null)
    } catch {
      /* keep confirm open */
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="wf-form" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="wf-subtitle" style={{ margin: 0 }}>Teams</p>
          <div className="q-hint" style={{ marginTop: 2 }}>
            {teams.length} team{teams.length === 1 ? '' : 's'} · used to assign tasks below.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!formOpen && (
            <button className="seal-add-btn" style={{ width: 'auto', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }} onClick={openNew}>
              <Plus style={{ width: 14, height: 14 }} /> New Team
            </button>
          )}
          <button className="wf-btn" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Manage'}
          </button>
        </div>
      </div>

      {open && (
        <>
          {formOpen && (
            <div style={{ marginTop: 14, borderTop: '1px dashed var(--border-strong)', paddingTop: 14 }}>
              <div className="form-field">
                <label>Team name</label>
                <input
                  type="text"
                  value={form.name}
                  placeholder="e.g. Electrical Crew"
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="form-field">
                <label>Members</label>
                {form.members.length === 0 && <div className="wf-order-empty">No members yet.</div>}
                <div className="wf-order-list">
                  {form.members.map((m, idx) => (
                    <div className="wf-order-item" key={idx}>
                      <input
                        type="text"
                        placeholder="Name"
                        value={m.name}
                        style={{ flex: 1 }}
                        onChange={(e) => updateMember(idx, { name: e.target.value })}
                      />
                      <input
                        type="email"
                        placeholder="Email (for 'assigned to me')"
                        value={m.email}
                        style={{ flex: 1.4 }}
                        onChange={(e) => updateMember(idx, { email: e.target.value })}
                      />
                      <button className="wf-remove" title="Remove" onClick={() => removeMember(idx)}>
                        <X style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  ))}
                </div>
                <button className="seal-add-btn" type="button" style={{ marginTop: 8 }} onClick={addMemberRow}>
                  + Add Member
                </button>
              </div>

              {formError && <div className="q-hint err">{formError}</div>}

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button className="seal-submit-btn" style={{ maxWidth: 160 }} disabled={saving} onClick={save}>
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Team'}
                </button>
                <button className="wf-btn" style={{ padding: '0 16px' }} disabled={saving} onClick={closeForm}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!formOpen && (
            <div className="wf-list" style={{ marginTop: 14 }}>
              {teams.length === 0 ? (
                <div className="q-hint">No teams yet. Create one to start assigning tasks.</div>
              ) : (
                teams.map((team) => {
                  const uses = usageCount(team.id)
                  return (
                    <div className="wf-card" key={team.id}>
                      <div className="wf-card-head">
                        <div>
                          <span className="wf-activity">{team.name}</span>{' '}
                          {uses > 0 && (
                            <span className="q-hint" style={{ margin: 0 }}>
                              assigned to {uses} task{uses === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                        <div className="wf-actions">
                          {deleteId === team.id ? (
                            <div className="wf-confirm">
                              Delete?
                              <button className="wf-btn danger" disabled={saving} onClick={() => confirmDelete(team.id)}>
                                {saving ? '…' : 'Yes, delete'}
                              </button>
                              <button className="wf-btn" disabled={saving} onClick={() => setDeleteId(null)}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button className="wf-btn" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => openEdit(team)}>
                                <Pencil style={{ width: 12, height: 12 }} /> Edit
                              </button>
                              <button
                                className="wf-btn danger"
                                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                                title={uses > 0 ? `${uses} task(s) will become unassigned` : undefined}
                                onClick={() => setDeleteId(team.id)}
                              >
                                <Trash2 style={{ width: 12, height: 12 }} /> Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="wf-chips">
                        {team.members.length === 0 ? (
                          <span className="q-hint" style={{ margin: 0 }}>No members</span>
                        ) : (
                          team.members.map((m) => (
                            <span className="wf-chip" key={m.email || m.name} title={m.email || undefined}>
                              {m.name}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
