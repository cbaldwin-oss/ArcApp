import { useMemo, useState } from 'react'
import { X } from 'lucide-react'

type Props = {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  disabled?: boolean
}

/**
 * Search box + checkbox list + removable chips + Select all (shown)/Deselect all — the same
 * picker WorkflowsBuilder uses for linking Activities to a Workflow, generalized so it isn't
 * duplicated for every new "pick a subset of a long list" case (Submittals' Assets, Settings'
 * submittal-exempt Assets, ...).
 */
export default function MultiSelectPicker({ label, options, selected, onChange, placeholder, disabled }: Props) {
  const [search, setSearch] = useState('')

  const available = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options
  }, [options, search])

  function toggle(opt: string, checked: boolean) {
    onChange(checked ? [...selected.filter((s) => s !== opt), opt] : selected.filter((s) => s !== opt))
  }
  function selectAll() {
    onChange(Array.from(new Set([...selected, ...available])))
  }
  function deselectAll() {
    onChange([])
  }

  return (
    <div className="form-field">
      <div className="wf-field-head">
        <label>{label}</label>
        <div className="wf-bulk">
          <button
            type="button"
            className="wf-link-btn"
            disabled={disabled || available.length === 0 || available.every((a) => selected.includes(a))}
            onClick={selectAll}
          >
            Select all{search.trim() ? ' shown' : ''}
          </button>
          <span className="wf-bulk-sep">·</span>
          <button type="button" className="wf-link-btn" disabled={disabled || selected.length === 0} onClick={deselectAll}>
            Deselect all
          </button>
        </div>
      </div>
      {selected.length > 0 && (
        <div className="wf-chips" style={{ marginBottom: 8 }}>
          {selected.map((s) => (
            <span className="wf-chip" key={s}>
              {s}
              <button className="wf-remove" style={{ marginLeft: 2 }} title="Remove" disabled={disabled} onClick={() => toggle(s, false)}>
                <X style={{ width: 12, height: 12 }} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        placeholder={placeholder ?? 'Search…'}
        value={search}
        disabled={disabled}
        onChange={(e) => setSearch(e.target.value)}
      />
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
        {available.length === 0 ? (
          <div className="wf-order-empty">No matches.</div>
        ) : (
          available.map((o) => (
            <label key={o} className="wf-check-row">
              <input type="checkbox" checked={selected.includes(o)} disabled={disabled} onChange={(e) => toggle(o, e.target.checked)} />
              {o}
            </label>
          ))
        )}
      </div>
    </div>
  )
}
