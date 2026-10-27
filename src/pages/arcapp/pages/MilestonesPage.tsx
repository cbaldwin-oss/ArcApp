import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react'
import {
  useGetAssetOptions,
  useGetCxAlloySettingsSheet,
  useSaveMilestone,
  useDeleteMilestone,
  SUBMITTAL_STATUSES,
  type MilestoneCriterion,
} from '../../../lib/api'
import { useMilestonesWithProgress, describeCriterion, type ComputedMilestone } from '../milestones'
import { MilestoneArc } from '../components/MilestonesPanel'
import MilestoneCriteriaBuilder from '../components/MilestoneCriteriaBuilder'
import { fmtDate } from '../utils'
import type { ShellContext } from '../ShellContext'

type FormState = { name: string; dueDate: string; criteria: MilestoneCriterion[] }
const EMPTY_FORM: FormState = { name: '', dueDate: '', criteria: [] }

function distinctZones(...lists: Array<Array<{ zone: string }>>): string[] {
  const set = new Set<string>()
  for (const list of lists) for (const r of list) if (r.zone.trim()) set.add(r.zone.trim())
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

export default function MilestonesPage() {
  const ctx = useOutletContext<ShellContext>()
  const { computed, data, loading, error, reload } = useMilestonesWithProgress(ctx.netaTrackerEnabled)
  const assetsFn = useGetAssetOptions()
  const cxSettingsFn = useGetCxAlloySettingsSheet()
  const saveFn = useSaveMilestone()
  const deleteFn = useDeleteMilestone()

  useEffect(() => {
    void assetsFn.trigger()
    void cxSettingsFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const criteriaOptions = useMemo(
    () => ({
      assets: assetsFn.data ?? [],
      checklistStatuses: cxSettingsFn.data?.checklistStatuses ?? [],
      issueStatuses: cxSettingsFn.data?.issueStatuses ?? [],
      submittalStatuses: SUBMITTAL_STATUSES,
      netaZones: distinctZones(data.neta.submissions, data.neta.returnedFiles),
      netaEnabled: ctx.netaTrackerEnabled,
    }),
    [assetsFn.data, cxSettingsFn.data, data.neta, ctx.netaTrackerEnabled],
  )

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setFormOpen(true)
  }
  function openEdit(m: ComputedMilestone) {
    setEditingId(m.id)
    setForm({ name: m.name, dueDate: m.dueDate, criteria: m.criteria })
    setFormError('')
    setFormOpen(true)
  }
  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  async function save() {
    if (!form.name.trim()) {
      setFormError('A name is required.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await saveFn.trigger({ id: editingId ?? undefined, name: form.name, dueDate: form.dueDate, criteria: form.criteria }).result
      closeForm()
      reload()
    } catch (err) {
      setFormError('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete(id: string) {
    setSaving(true)
    try {
      await deleteFn.trigger({ id }).result
      setDeleteId(null)
      reload()
    } finally {
      setSaving(false)
    }
  }

  const canEdit = ctx.canEdit

  return (
    <section className="panel" id="milestones">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Milestones</h2>
          <span className="panel-count">{loading ? '—' : `${computed.length} tracked`}</span>
        </div>
        <div className="panel-header-right" style={{ gap: 10 }}>
          {canEdit && !formOpen && (
            <button type="button" className="panel-action-btn" onClick={openNew}>
              <Plus style={{ width: 15, height: 15 }} />
              New Milestone
            </button>
          )}
          <button className={loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={reload} aria-label="Refresh milestones">
            <RefreshCw />
          </button>
        </div>
      </div>
      <div className="sync-note">
        A milestone's % is computed automatically from its completion criteria — pulled live from
        Checklists, Issues, Submittals, and NETA Tracker — not set by hand.
        {!canEdit ? ' · sign in as an authorized editor to add or edit' : ''}
      </div>

      <div className="panel-body">
        {loading && <div className="q-hint">Loading…</div>}
        {error && !loading && (
          <div className="table-error" style={{ padding: '16px 0' }}>
            Couldn&apos;t load milestones ({error}).
            <br />
            <button className="retry-btn" onClick={reload}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {formOpen && canEdit && (
              <div className="wf-form" style={{ marginBottom: 18 }}>
                <div className="seal-row3" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
                  <div className="form-field">
                    <label>Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Chiller Plant — Functional Testing"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="form-field">
                    <label>Due date</label>
                    <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
                  </div>
                </div>

                <MilestoneCriteriaBuilder
                  criteria={form.criteria}
                  onChange={(criteria) => setForm((f) => ({ ...f, criteria }))}
                  disabled={saving}
                  options={criteriaOptions}
                />

                {formError && <div className="q-hint err">{formError}</div>}

                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button className="seal-submit-btn" style={{ maxWidth: 200 }} disabled={saving} onClick={save}>
                    {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Milestone'}
                  </button>
                  <button className="wf-btn" style={{ padding: '0 16px' }} disabled={saving} onClick={closeForm}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {computed.length === 0 && !formOpen && (
              <div className="table-empty">
                No milestones yet.{canEdit ? ' Click "New Milestone" to add the first one.' : ''}
              </div>
            )}

            <div className="milestone-list">
              {computed.map((m) => (
                <div key={m.id} className="milestone-item" style={{ alignItems: 'flex-start' }}>
                  <MilestoneArc pct={m.progress.pct} status={m.progress.status} />
                  <div className="milestone-main">
                    <p className="milestone-name">{m.name}</p>
                    <div className="milestone-meta">
                      <span className={`status-chip ${m.progress.status}`}>{m.progress.label}</span>
                      <span className="milestone-date">{m.dueDate ? fmtDate(m.dueDate) : 'No due date'}</span>
                    </div>
                    {m.criteria.length > 0 ? (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {m.criteria.map((c, i) => {
                          const r = m.progress.results[i]
                          return (
                            <div key={i} className="q-hint" style={{ margin: 0 }}>
                              {describeCriterion(c)}
                              {r && r.total > 0 ? ` — ${r.satisfied}/${r.total}` : ' — no matching items yet'}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="q-hint" style={{ marginTop: 8 }}>
                        No criteria set — add one to track progress automatically.
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {deleteId === m.id ? (
                        <div className="wf-confirm">
                          Delete?
                          <button className="wf-btn danger" disabled={saving} onClick={() => confirmDelete(m.id)}>
                            {saving ? '…' : 'Yes, delete'}
                          </button>
                          <button className="wf-btn" disabled={saving} onClick={() => setDeleteId(null)}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button className="wf-btn" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => openEdit(m)}>
                            <Pencil style={{ width: 12, height: 12 }} /> Edit
                          </button>
                          <button
                            className="wf-btn danger"
                            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                            onClick={() => setDeleteId(m.id)}
                          >
                            <Trash2 style={{ width: 12, height: 12 }} /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
