import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'

/**
 * Shared editable-text and toggle controls for admin-only settings — originally local to
 * SettingsPanel.tsx, extracted 2026-10-26 when most per-module settings moved out of the single
 * Settings tab into each module's own page (Checklists, Issues, Joint Packs, NETA Tracker,
 * Submittals), leaving only cross-cutting/app-wide things in Settings itself. Both now used from
 * several files, not just one.
 */
export function Field({
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
      setMsg({ text: 'Saved.', cls: 'q-hint ok' })
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

export function ToggleField({
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
      setMsg({ text: 'Saved.', cls: 'q-hint ok' })
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
