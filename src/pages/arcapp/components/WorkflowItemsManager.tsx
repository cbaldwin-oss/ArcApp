import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useSaveWorkflowItem, useDeleteWorkflowItem, slugifyItemKey } from '../../../lib/api'
import type { WorkflowItem } from '../workflowItems'

type Workflow = { id: string; activities: string[]; items: string[] }

type Props = {
  /** Full catalog (including disabled items), any order — this component sorts alphabetically. */
  items: WorkflowItem[]
  /** Used only to block deleting an item still referenced by a workflow. */
  workflows: Workflow[]
  canEdit: boolean
  /** Re-fetch the catalog in the parent after a mutation here. */
  onChanged: () => void
}

type FormState = { key: string; label: string; description: string; enabled: boolean }
const EMPTY_FORM: FormState = { key: '', label: '', description: '', enabled: true }

export default function WorkflowItemsManager({ items, workflows, canEdit, onChanged }: Props) {
  const saveFn = useSaveWorkflowItem()
  const deleteFn = useDeleteWorkflowItem()

  const [formOpen, setFormOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null) // null = adding a new item
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [keyTouched, setKeyTouched] = useState(false) // stop auto-slugging the key once hand-edited
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteKey, setDeleteKey] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null) // enable/disable toggle in flight

  // Alphabetical — order isn't curated here anymore. Each workflow sets its own item order
  // when it's built (the "Order shown on-site" drag list), so there's nothing to sort by here.
  const sorted = [...items].sort((a, b) => a.label.localeCompare(b.label))
  const usageCount = (key: string) => workflows.filter((w) => w.items.includes(key)).length

  function openNew() {
    setEditingKey(null)
    setForm(EMPTY_FORM)
    setKeyTouched(false)
    setFormError('')
    setFormOpen(true)
  }
  function openEdit(it: WorkflowItem) {
    setEditingKey(it.key)
    setForm({ key: it.key, label: it.label, description: it.description, enabled: it.enabled })
    setFormError('')
    setFormOpen(true)
  }
  function closeForm() {
    setFormOpen(false)
    setEditingKey(null)
    setFormError('')
  }

  function onLabelChange(label: string) {
    setForm((f) => ({ ...f, label, key: keyTouched ? f.key : slugifyItemKey(label) }))
  }
  function onKeyChange(key: string) {
    setKeyTouched(true)
    setForm((f) => ({ ...f, key: key.toLowerCase() }))
  }

  async function save() {
    const key = form.key.trim()
    const label = form.label.trim()
    if (!label) {
      setFormError('A label is required.')
      return
    }
    if (!key) {
      setFormError('A key is required.')
      return
    }
    if (!editingKey && items.some((i) => i.key === key)) {
      setFormError(`"${key}" is already in use.`)
      return
    }
    // sort_order is just a stable insertion order now (nothing here lets an admin edit it) — new
    // items go after everything that exists so far.
    const sortOrder = editingKey
      ? (items.find((i) => i.key === editingKey)?.sortOrder ?? 0)
      : items.length
        ? Math.max(...items.map((i) => i.sortOrder)) + 10
        : 10

    setSaving(true)
    setFormError('')
    try {
      await saveFn.trigger({ key, label, description: form.description, enabled: form.enabled, sortOrder }).result
      onChanged()
      closeForm()
    } catch (err) {
      setFormError('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete(key: string) {
    setSaving(true)
    try {
      await deleteFn.trigger({ key }).result
      onChanged()
      setDeleteKey(null)
    } catch {
      /* keep confirm open; nothing else to surface here */
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnabled(it: WorkflowItem) {
    setBusyKey(it.key)
    try {
      await saveFn.trigger({ key: it.key, label: it.label, description: it.description, enabled: !it.enabled, sortOrder: it.sortOrder }).result
      onChanged()
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <div>
          <p className="wf-subtitle">Workflow Items</p>
          <div className="q-hint" style={{ marginTop: 0 }}>
            The on-site modules a workflow can include. Add, rename, or retire them here — each workflow
            sets its own item order when it&apos;s built.
          </div>
        </div>
        {canEdit && !formOpen && (
          <button className="seal-add-btn" style={{ width: 'auto', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }} onClick={openNew}>
            <Plus style={{ width: 14, height: 14 }} /> New Item
          </button>
        )}
      </div>

      {!canEdit && <div className="q-hint">Only authorized editors can manage workflow items.</div>}

      {formOpen && canEdit && (
        <div className="wf-form">
          <div className="seal-row3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="form-field">
              <label>Label</label>
              <input type="text" value={form.label} placeholder="e.g. Equipment Photos" onChange={(e) => onLabelChange(e.target.value)} />
            </div>
            <div className="form-field">
              <label>{editingKey ? 'Key (fixed once created)' : 'Key (auto-filled from label — edit if needed)'}</label>
              <input
                type="text"
                value={form.key}
                placeholder="e.g. equipment_photos"
                disabled={!!editingKey}
                onChange={(e) => onKeyChange(e.target.value)}
              />
            </div>
          </div>
          <div className="form-field">
            <label>Description</label>
            <textarea
              value={form.description}
              placeholder="What this item captures — shown as a hint on-site"
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <label className="wf-check-row" style={{ padding: '2px 0 4px' }}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
            Enabled (selectable on new/edited workflows)
          </label>

          {formError && <div className="q-hint err">{formError}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="seal-submit-btn" style={{ maxWidth: 160 }} disabled={saving} onClick={save}>
              {saving ? 'Saving…' : editingKey ? 'Save Changes' : 'Add Item'}
            </button>
            <button className="wf-btn" style={{ padding: '0 16px' }} disabled={saving} onClick={closeForm}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 && !formOpen ? (
        <div className="q-hint" style={{ padding: '8px 0' }}>No items yet.</div>
      ) : (
        <div className="wf-order-list">
          {sorted.map((it) => {
            const uses = usageCount(it.key)
            const busy = busyKey === it.key
            return (
              <div className="wf-item-row" key={it.key}>
                <div className="wf-item-body">
                  <div className="wf-item-title">
                    <span className="wf-order-label">{it.label}</span>
                    {!it.enabled && <span className="wf-tag-disabled">disabled</span>}
                    {uses > 0 && (
                      <span className="q-hint" style={{ margin: 0 }}>
                        used by {uses} workflow{uses === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  {it.description && <div className="q-hint wf-item-desc">{it.description}</div>}
                </div>

                {canEdit &&
                  (deleteKey === it.key ? (
                    <div className="wf-confirm">
                      Delete?
                      <button className="wf-btn danger" disabled={saving} onClick={() => confirmDelete(it.key)}>
                        {saving ? '…' : 'Yes, delete'}
                      </button>
                      <button className="wf-btn" disabled={saving} onClick={() => setDeleteKey(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="wf-item-actions">
                      <button className="wf-btn" disabled={busy} onClick={() => toggleEnabled(it)}>
                        {busy ? '…' : it.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button className="wf-btn" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => openEdit(it)}>
                        <Pencil style={{ width: 12, height: 12 }} /> Edit
                      </button>
                      <button
                        className="wf-btn danger"
                        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                        disabled={uses > 0}
                        title={uses > 0 ? 'Remove it from every workflow first.' : undefined}
                        onClick={() => setDeleteKey(it.key)}
                      >
                        <Trash2 style={{ width: 12, height: 12 }} /> Delete
                      </button>
                    </div>
                  ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
