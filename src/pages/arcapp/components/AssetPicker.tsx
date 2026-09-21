import { useEffect, useMemo, useState } from 'react'

type Props = {
  options: string[]
  value: string
  onChange: (asset: string) => void
  loading: boolean
  placeholder?: string
}

/**
 * A plain <select> is unusable once STY4dropdownoptions has 100+ assets — no way to type to
 * narrow it down (and <datalist>'s suggestions don't reliably show on iOS Safari, which matters
 * given this app runs on iPad). This filters a click-to-pick list live as you type instead.
 * Originally built for Tamper Seals' standalone logging form; shared with RTFT's for the same
 * reason.
 */
export default function AssetPicker({ options, value, onChange, loading, placeholder }: Props) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setQuery(value)
  }, [value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options
    return list.slice(0, 60)
  }, [options, query])

  function pick(asset: string) {
    onChange(asset)
    setQuery(asset)
    setOpen(false)
  }

  return (
    <div className="asset-picker">
      <input
        type="text"
        placeholder={loading ? 'Loading assets…' : (placeholder ?? 'Type to search assets...')}
        value={query}
        disabled={loading}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          if (!e.target.value.trim()) onChange('')
        }}
        onBlur={() => {
          setOpen(false)
          setQuery(value)
        }}
      />
      {open && !loading && (
        <div className="asset-picker-list">
          {filtered.length === 0 && <div className="asset-picker-empty">No matching assets.</div>}
          {filtered.map((o) => (
            <button
              type="button"
              key={o}
              className={`asset-picker-item${o === value ? ' active' : ''}`}
              // mousedown (not click) fires before the input's blur, so the pick registers
              // before onBlur would otherwise revert the query text and close the list first.
              onMouseDown={(e) => {
                e.preventDefault()
                pick(o)
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
