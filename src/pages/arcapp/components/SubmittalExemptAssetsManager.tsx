import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { useGetAssetOptions } from '../../../lib/api'
import MultiSelectPicker from './MultiSelectPicker'

type Props = {
  value: string[]
  canEdit: boolean
  loading: boolean
  onSave: (values: string[]) => Promise<void>
}

/**
 * Assets marked here are excluded entirely from the Submittals page's "missing" count — they
 * genuinely never need a submittal (e.g. a space with nothing commissionable in it), so they
 * shouldn't count against the total the way an asset that's simply not reviewed yet does.
 */
export default function SubmittalExemptAssetsManager({ value, canEdit, loading, onSave }: Props) {
  const assetsFn = useGetAssetOptions()
  const [selected, setSelected] = useState<string[]>(value)
  const [msg, setMsg] = useState<{ text: string; cls: string }>({ text: '', cls: 'q-hint' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void assetsFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    setSelected(value)
  }, [value])

  const assets = (assetsFn.data as string[] | undefined) ?? []
  const dirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...value].sort())
  const disabled = !canEdit || busy || loading || !assetsFn.data

  async function save() {
    if (disabled) return
    setBusy(true)
    setMsg({ text: 'Saving…', cls: 'q-hint' })
    try {
      await onSave(selected)
      setMsg({ text: 'Saved app-wide.', cls: 'q-hint ok' })
    } catch (err) {
      setMsg({ text: 'Failed: ' + (err instanceof Error ? err.message : String(err)), cls: 'q-hint err' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 26, maxWidth: 640 }}>
      <p className="wf-subtitle">Assets Exempt From Submittal Review</p>
      <div className="q-hint" style={{ marginTop: 0, marginBottom: 10 }}>
        These assets never need a submittal — they&apos;re excluded from the Submittals page&apos;s
        &quot;missing a submittal&quot; count entirely, instead of just sitting there unreviewed.
      </div>
      <MultiSelectPicker
        label={`Exempt assets (${selected.length} selected)`}
        options={assets}
        selected={selected}
        onChange={setSelected}
        placeholder="Search assets…"
        disabled={disabled}
      />
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
