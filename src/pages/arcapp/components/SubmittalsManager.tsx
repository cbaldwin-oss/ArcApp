import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, X, RefreshCw, Paperclip, ExternalLink } from 'lucide-react'
import {
  useGetAssetOptions,
  useGetSubmittalsList,
  useSaveSubmittalRecord,
  useDeleteSubmittalRecord,
  useUploadSubmittalFile,
} from '../../../lib/api'
import type { Submittal } from '../../../lib/api'

const STATUSES = ['', 'Not Started', 'In Review', 'Approved', 'Rejected']

function statusClass(s: string): string {
  const t = (s || '').toLowerCase()
  if (t === 'approved') return 'go'
  if (t === 'rejected') return 'hold'
  if (t === 'in review') return 'caution'
  return 'muted'
}

type FormState = { title: string; reviewStatus: string; notes: string; assets: string[] }
const EMPTY_FORM: FormState = { title: '', reviewStatus: '', notes: '', assets: [] }

export default function SubmittalsManager({ canEdit }: { canEdit: boolean }) {
  const assetsFn = useGetAssetOptions()
  const listFn = useGetSubmittalsList()
  const saveFn = useSaveSubmittalRecord()
  const deleteFn = useDeleteSubmittalRecord()
  const uploadFn = useUploadSubmittalFile()

  function load() {
    void assetsFn.trigger()
    void listFn.trigger()
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const assets = (assetsFn.data as string[] | undefined) ?? []
  const submittals = listFn.data ?? []
  const state = assetsFn.error || listFn.error ? 'error' : !assetsFn.data || !listFn.data ? 'loading' : 'ready'
  const loading = assetsFn.loading || listFn.loading

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [existingFile, setExistingFile] = useState<{ url: string; name: string } | null>(null)
  const [pickedFile, setPickedFile] = useState<File | null>(null)
  const [assetSearch, setAssetSearch] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const availableAssets = useMemo(() => {
    const q = assetSearch.trim().toLowerCase()
    return q ? assets.filter((a) => a.toLowerCase().includes(q)) : assets
  }, [assets, assetSearch])

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setExistingFile(null)
    setPickedFile(null)
    setAssetSearch('')
    setFormError('')
    setFormOpen(true)
  }
  function openEdit(s: Submittal) {
    setEditingId(s.id)
    setForm({ title: s.title, reviewStatus: s.reviewStatus, notes: s.notes, assets: [...s.assets] })
    setExistingFile(s.fileUrl ? { url: s.fileUrl, name: s.fileName || s.fileUrl } : null)
    setPickedFile(null)
    setAssetSearch('')
    setFormError('')
    setFormOpen(true)
  }
  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setFormError('')
  }

  function toggleAsset(asset: string, checked: boolean) {
    setForm((f) => ({
      ...f,
      assets: checked ? [...f.assets.filter((a) => a !== asset), asset] : f.assets.filter((a) => a !== asset),
    }))
  }
  function selectAllAssets() {
    setForm((f) => ({ ...f, assets: Array.from(new Set([...f.assets, ...availableAssets])) }))
  }
  function deselectAllAssets() {
    setForm((f) => ({ ...f, assets: [] }))
  }

  async function save() {
    if (!form.title.trim()) {
      setFormError('A title is required.')
      return
    }
    if (form.assets.length === 0) {
      setFormError('Select at least one asset this submittal applies to.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      let fileUrl = existingFile?.url ?? ''
      let fileName = existingFile?.name ?? ''
      if (pickedFile) {
        const uploaded = await uploadFn.trigger({ file: pickedFile }).result
        fileUrl = uploaded.url
        fileName = uploaded.name
      }
      await saveFn.trigger({
        id: editingId ?? undefined,
        title: form.title.trim(),
        fileUrl,
        fileName,
        assets: form.assets,
        reviewStatus: form.reviewStatus,
        notes: form.notes,
      }).result
      load()
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
      await deleteFn.trigger({ id }).result
      setDeleteId(null)
      load()
    } catch {
      /* keep confirm open */
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel" id="submittals">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Submittals</h2>
          <span className="panel-count">{state === 'ready' ? `${submittals.length} submittals` : '—'}</span>
        </div>
        <div className="panel-header-right" style={{ gap: 10 }}>
          {canEdit && !formOpen && (
            <button type="button" className="panel-action-btn" onClick={openNew}>
              <Plus style={{ width: 15, height: 15 }} />
              New Submittal
            </button>
          )}
          <button className={loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={load} aria-label="Refresh submittals">
            <RefreshCw />
          </button>
        </div>
      </div>
      <div className="sync-note">
        Upload a submittal, pick every asset it applies to, then set one review status/notes for
        all of them at once — assets from <b style={{ color: 'var(--text-muted)' }}>STY4dropdownoptions.Assets</b>
        {!canEdit ? ' · sign in as an authorized editor to add or edit' : ''}
      </div>

      <div className="panel-body">
        {state === 'loading' && <div className="q-hint">Loading…</div>}
        {state === 'error' && (
          <div className="table-error" style={{ padding: '16px 0' }}>
            Couldn&apos;t load submittals or assets.
            <br />
            <button className="retry-btn" onClick={load}>
              Retry
            </button>
          </div>
        )}

        {state === 'ready' && (
          <>
            {formOpen && canEdit && (
              <div className="wf-form">
                <div className="seal-row3" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
                  <div className="form-field">
                    <label>Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Submittal #042 - Chiller Cut Sheets"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  </div>
                  <div className="form-field">
                    <label>Review status</label>
                    <select value={form.reviewStatus} onChange={(e) => setForm((f) => ({ ...f, reviewStatus: e.target.value }))}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s || '—'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label>File</label>
                  <input type="file" onChange={(e) => setPickedFile(e.target.files?.[0] ?? null)} />
                  <div className="q-hint" style={{ marginTop: 4 }}>
                    {pickedFile
                      ? `Will upload: ${pickedFile.name}`
                      : existingFile
                        ? `Current file: ${existingFile.name} — choose a new one to replace it.`
                        : 'No file attached yet.'}
                  </div>
                </div>

                <div className="form-field">
                  <label>Notes</label>
                  <textarea
                    placeholder="Anything worth noting about this review"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>

                <div className="form-field">
                  <div className="wf-field-head">
                    <label>Assets this submittal applies to (select one or more)</label>
                    <div className="wf-bulk">
                      <button
                        type="button"
                        className="wf-link-btn"
                        disabled={availableAssets.length === 0 || availableAssets.every((a) => form.assets.includes(a))}
                        onClick={selectAllAssets}
                      >
                        Select all{assetSearch.trim() ? ' shown' : ''}
                      </button>
                      <span className="wf-bulk-sep">·</span>
                      <button type="button" className="wf-link-btn" disabled={form.assets.length === 0} onClick={deselectAllAssets}>
                        Deselect all
                      </button>
                    </div>
                  </div>
                  {form.assets.length > 0 && (
                    <div className="wf-chips" style={{ marginBottom: 8 }}>
                      {form.assets.map((a) => (
                        <span className="wf-chip" key={a}>
                          {a}
                          <button className="wf-remove" style={{ marginLeft: 2 }} title="Remove" onClick={() => toggleAsset(a, false)}>
                            <X style={{ width: 12, height: 12 }} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input type="text" placeholder="Search assets…" value={assetSearch} onChange={(e) => setAssetSearch(e.target.value)} />
                  <div
                    style={{
                      marginTop: 6,
                      maxHeight: 220,
                      overflowY: 'auto',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-elev)',
                      padding: '4px 10px',
                    }}
                  >
                    {availableAssets.length === 0 ? (
                      <div className="wf-order-empty">No matching assets.</div>
                    ) : (
                      availableAssets.map((a) => (
                        <label key={a} className="wf-check-row">
                          <input type="checkbox" checked={form.assets.includes(a)} onChange={(e) => toggleAsset(a, e.target.checked)} />
                          {a}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {formError && <div className="q-hint err">{formError}</div>}

                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button className="seal-submit-btn" style={{ maxWidth: 200 }} disabled={saving} onClick={save}>
                    {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Submittal'}
                  </button>
                  <button className="wf-btn" style={{ padding: '0 16px' }} disabled={saving} onClick={closeForm}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {submittals.length === 0 && !formOpen ? (
              <div className="q-hint" style={{ padding: '8px 0' }}>
                No submittals yet.{canEdit ? ' Upload one to get started.' : ''}
              </div>
            ) : (
              <div className="wf-list">
                {submittals.map((s) => (
                  <div className="wf-card" key={s.id}>
                    <div className="wf-card-head" style={{ alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="wf-order-label" style={{ fontSize: 14 }}>
                            {s.title}
                          </span>
                          <span className={`status-chip ${statusClass(s.reviewStatus)}`}>{s.reviewStatus || 'No status'}</span>
                        </div>
                        {s.fileUrl && (
                          <a
                            href={s.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cx-link"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, color: 'var(--green-soft)' }}
                          >
                            <Paperclip style={{ width: 12, height: 12 }} />
                            {s.fileName || 'View file'}
                            <ExternalLink style={{ width: 11, height: 11 }} />
                          </a>
                        )}
                        {s.notes && (
                          <div className="q-hint" style={{ margin: '6px 0 0' }}>
                            {s.notes}
                          </div>
                        )}
                      </div>
                      {canEdit && (
                        <div className="wf-actions">
                          {deleteId === s.id ? (
                            <div className="wf-confirm">
                              Delete?
                              <button className="wf-btn danger" disabled={saving} onClick={() => confirmDelete(s.id)}>
                                {saving ? '…' : 'Yes, delete'}
                              </button>
                              <button className="wf-btn" disabled={saving} onClick={() => setDeleteId(null)}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button className="wf-btn" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => openEdit(s)}>
                                <Pencil style={{ width: 12, height: 12 }} /> Edit
                              </button>
                              <button
                                className="wf-btn danger"
                                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                                onClick={() => setDeleteId(s.id)}
                              >
                                <Trash2 style={{ width: 12, height: 12 }} /> Delete
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="wf-chips">
                      {s.assets.map((a) => (
                        <span
                          className="wf-chip"
                          key={a}
                          style={{ color: 'var(--text)', background: 'var(--bg-elev)', borderColor: 'var(--border-strong)' }}
                        >
                          {a}
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
    </section>
  )
}
