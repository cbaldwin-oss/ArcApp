import { useEffect, useState, useMemo } from 'react'
import { Plus, GripVertical, Pencil, Trash2, X } from 'lucide-react'
import { useGetActivityOptions, useGetWorkflowItems, useGetWorkflows, useSaveWorkflows } from '../../../lib/api'
import { itemLabels, type WorkflowItem } from '../workflowItems'

type Workflow = { id: string; activities: string[]; items: string[] }

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `wf_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export default function WorkflowsBuilder({ canEdit }: { canEdit: boolean }) {
  const activitiesFn = useGetActivityOptions()
  const itemsFn = useGetWorkflowItems()
  const workflowsFn = useGetWorkflows()
  const saveFn = useSaveWorkflows()

  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formActivities, setFormActivities] = useState<string[]>([])
  const [formItems, setFormItems] = useState<string[]>([]) // ordered
  const [activitySearch, setActivitySearch] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function load() {
    void activitiesFn.trigger()
    void itemsFn.trigger()
    void workflowsFn.trigger()
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (workflowsFn.data) setWorkflows(workflowsFn.data as Workflow[])
  }, [workflowsFn.data])

  const activities = (activitiesFn.data as string[] | undefined) ?? []
  const catalog = (itemsFn.data as WorkflowItem[] | undefined) ?? []
  // Retired items stay renderable on existing workflows, but can't be added to new ones.
  const selectableItems = useMemo(() => catalog.filter((i) => i.enabled), [catalog])
  const LABELS = useMemo(() => itemLabels(catalog), [catalog])

  const state =
    activitiesFn.error || workflowsFn.error || itemsFn.error
      ? 'error'
      : !activitiesFn.data || !workflowsFn.data || !itemsFn.data
        ? 'loading'
        : 'ready'

  // Activities already claimed by OTHER workflows (excluded from the picker).
  const claimedByOthers = useMemo(() => {
    const s = new Set<string>()
    for (const w of workflows) {
      if (w.id === editingId) continue
      for (const a of w.activities) s.add(a.toLowerCase())
    }
    return s
  }, [workflows, editingId])

  const availableActivities = useMemo(() => {
    const q = activitySearch.trim().toLowerCase()
    return activities.filter(
      (a) => !claimedByOthers.has(a.toLowerCase()) && (!q || a.toLowerCase().includes(q)),
    )
  }, [activities, claimedByOthers, activitySearch])

  function openNew() {
    setEditingId(null)
    setFormActivities([])
    setFormItems([])
    setActivitySearch('')
    setFormError('')
    setFormOpen(true)
  }
  function openEdit(w: Workflow) {
    setEditingId(w.id)
    setFormActivities([...w.activities])
    setFormItems(w.items.filter((i) => LABELS[i]))
    setActivitySearch('')
    setFormError('')
    setFormOpen(true)
  }
  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setFormError('')
  }

  function toggleActivity(activity: string, checked: boolean) {
    setFormActivities((prev) => (checked ? [...prev.filter((a) => a !== activity), activity] : prev.filter((a) => a !== activity)))
  }
  function toggleItem(key: string, checked: boolean) {
    setFormItems((prev) => (checked ? [...prev.filter((k) => k !== key), key] : prev.filter((k) => k !== key)))
  }

  // "Select all" acts on what's currently listed (i.e. respects the search filter);
  // "Deselect all" clears the whole selection, including anything filtered out of view.
  function selectAllActivities() {
    setFormActivities((prev) => Array.from(new Set([...prev, ...availableActivities])))
  }
  function deselectAllActivities() {
    setFormActivities([])
  }
  function selectAllItems() {
    setFormItems((prev) => [...prev, ...selectableItems.map((i) => i.key).filter((k) => !prev.includes(k))])
  }
  function deselectAllItems() {
    setFormItems([])
  }

  function reorder(from: number, to: number) {
    setFormItems((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      if (moved === undefined) return prev
      next.splice(to, 0, moved)
      return next
    })
  }

  async function persist(next: Workflow[]) {
    await saveFn.trigger({ workflows: next }).result
    setWorkflows(next)
  }

  async function save() {
    if (formActivities.length === 0) {
      setFormError('Choose at least one Activity.')
      return
    }
    if (formItems.length === 0) {
      setFormError('Select at least one item.')
      return
    }
    // Guard: none of the chosen activities may belong to another workflow.
    const conflict = formActivities.find((a) => claimedByOthers.has(a.toLowerCase()))
    if (conflict) {
      setFormError(`"${conflict}" already belongs to another workflow.`)
      return
    }

    const wf: Workflow = { id: editingId ?? newId(), activities: formActivities, items: formItems }
    const next = editingId ? workflows.map((w) => (w.id === editingId ? wf : w)) : [...workflows, wf]

    setSaving(true)
    setFormError('')
    try {
      await persist(next)
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
      await persist(workflows.filter((w) => w.id !== id))
      setDeleteId(null)
    } catch {
      /* keep confirm open; nothing else to surface here */
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <div>
          <p className="wf-subtitle">Workflows</p>
          <div className="q-hint" style={{ marginTop: 0 }}>
            Link one or more Activity types to the ordered set of on-site modules shown when they&apos;re logged.
          </div>
        </div>
        {canEdit && !formOpen && (
          <button className="seal-add-btn" style={{ width: 'auto', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }} onClick={openNew}>
            <Plus style={{ width: 14, height: 14 }} /> New Workflow
          </button>
        )}
      </div>

      {!canEdit && <div className="q-hint">Only authorized editors can manage workflows.</div>}

      {state === 'loading' && <div className="q-hint">Loading workflows…</div>}
      {state === 'error' && (
        <div className="table-error" style={{ padding: '16px 0' }}>
          Couldn&apos;t load workflows or activities.
          <br />
          <button className="retry-btn" onClick={load}>Retry</button>
        </div>
      )}

      {state === 'ready' && (
        <>
          {formOpen && canEdit && (
            <div className="wf-form">
              <div className="form-field">
                <div className="wf-field-head">
                  <label>Activities (select one or more)</label>
                  <div className="wf-bulk">
                    <button
                      type="button"
                      className="wf-link-btn"
                      disabled={availableActivities.length === 0 || availableActivities.every((a) => formActivities.includes(a))}
                      onClick={selectAllActivities}
                    >
                      Select all{activitySearch.trim() ? ' shown' : ''}
                    </button>
                    <span className="wf-bulk-sep">·</span>
                    <button type="button" className="wf-link-btn" disabled={formActivities.length === 0} onClick={deselectAllActivities}>
                      Deselect all
                    </button>
                  </div>
                </div>
                {formActivities.length > 0 && (
                  <div className="wf-chips" style={{ marginBottom: 8 }}>
                    {formActivities.map((a) => (
                      <span className="wf-chip" key={a}>
                        {a}
                        <button
                          className="wf-remove"
                          style={{ marginLeft: 2 }}
                          title="Remove"
                          onClick={() => toggleActivity(a, false)}
                        >
                          <X style={{ width: 12, height: 12 }} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  placeholder="Search activities…"
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                />
                <div
                  style={{
                    marginTop: 6,
                    maxHeight: 180,
                    overflowY: 'auto',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-elev)',
                    padding: '4px 10px',
                  }}
                >
                  {availableActivities.length === 0 ? (
                    <div className="wf-order-empty">No matching activities.</div>
                  ) : (
                    availableActivities.map((a) => (
                      <label key={a} className="wf-check-row">
                        <input
                          type="checkbox"
                          checked={formActivities.includes(a)}
                          onChange={(e) => toggleActivity(a, e.target.checked)}
                        />
                        {a}
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="form-field">
                <div className="wf-field-head">
                  <label>Items to include</label>
                  <div className="wf-bulk">
                    <button
                      type="button"
                      className="wf-link-btn"
                      disabled={selectableItems.every((i) => formItems.includes(i.key))}
                      onClick={selectAllItems}
                    >
                      Select all
                    </button>
                    <span className="wf-bulk-sep">·</span>
                    <button type="button" className="wf-link-btn" disabled={formItems.length === 0} onClick={deselectAllItems}>
                      Deselect all
                    </button>
                  </div>
                </div>
                <div className="wf-check-grid">
                  {selectableItems.map((it) => {
                    const checked = formItems.includes(it.key)
                    return (
                      <label key={it.key} className="wf-check-row" title={it.description || undefined}>
                        <input type="checkbox" checked={checked} onChange={(e) => toggleItem(it.key, e.target.checked)} />
                        {it.label}
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="form-field">
                <label>Order shown on-site (drag to reorder)</label>
                {formItems.length === 0 ? (
                  <div className="wf-order-empty">Check items above to add them here.</div>
                ) : (
                  <div className="wf-order-list">
                    {formItems.map((key, idx) => (
                      <div
                        key={key}
                        className={`wf-order-item${dragIndex === idx ? ' dragging' : ''}${overIndex === idx && dragIndex !== idx ? ' drag-over' : ''}`}
                        draggable
                        onDragStart={() => setDragIndex(idx)}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (overIndex !== idx) setOverIndex(idx)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (dragIndex !== null) reorder(dragIndex, idx)
                          setDragIndex(null)
                          setOverIndex(null)
                        }}
                        onDragEnd={() => {
                          setDragIndex(null)
                          setOverIndex(null)
                        }}
                      >
                        <span className="wf-grip" aria-hidden>
                          <GripVertical style={{ width: 15, height: 15 }} />
                        </span>
                        <span className="wf-order-num">{idx + 1}</span>
                        <span className="wf-order-label">{LABELS[key]}</span>
                        <button className="wf-remove" title="Remove" onClick={() => toggleItem(key, false)}>
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {formError && <div className="q-hint err">{formError}</div>}

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button className="seal-submit-btn" style={{ maxWidth: 160 }} disabled={saving} onClick={save}>
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Workflow'}
                </button>
                <button className="wf-btn" style={{ padding: '0 16px' }} disabled={saving} onClick={closeForm}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {workflows.length === 0 && !formOpen ? (
            <div className="q-hint" style={{ padding: '8px 0' }}>No workflows yet. Create one to get started.</div>
          ) : (
            <div className="wf-list">
              {workflows.map((w) => (
                <div className="wf-card" key={w.id}>
                  <div className="wf-card-head">
                    <div className="wf-chips">
                      {w.activities.map((a) => (
                        <span className="wf-chip" key={a} style={{ color: 'var(--text)', background: 'var(--bg-elev)', borderColor: 'var(--border-strong)' }}>
                          {a}
                        </span>
                      ))}
                    </div>
                    {canEdit && (
                      <div className="wf-actions">
                        {deleteId === w.id ? (
                          <div className="wf-confirm">
                            Delete?
                            <button className="wf-btn danger" disabled={saving} onClick={() => confirmDelete(w.id)}>
                              {saving ? '…' : 'Yes, delete'}
                            </button>
                            <button className="wf-btn" disabled={saving} onClick={() => setDeleteId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <>
                            <button className="wf-btn" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => openEdit(w)}>
                              <Pencil style={{ width: 12, height: 12 }} /> Edit
                            </button>
                            <button className="wf-btn danger" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setDeleteId(w.id)}>
                              <Trash2 style={{ width: 12, height: 12 }} /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="wf-chips">
                    {w.items.filter((i) => LABELS[i]).map((i, idx) => (
                      <span className="wf-chip" key={i}>
                        <span className="n">{idx + 1}</span>
                        {LABELS[i]}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
