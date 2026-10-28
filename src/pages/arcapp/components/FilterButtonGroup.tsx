export const ALL = 'All'

/** Toggles a value in/out of a multi-select filter set, same semantics as LaunchPad's Tamper Seal
 * log filter bar: clicking "All" clears back to just {All}; clicking a specific value drops "All"
 * and toggles that value; emptying the set falls back to {All} rather than matching nothing. */
export function toggleFilterValue(current: Set<string>, value: string): Set<string> {
  const next = new Set(current)
  if (value === ALL) return new Set([ALL])
  next.delete(ALL)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  if (next.size === 0) next.add(ALL)
  return next
}

/** A row of toggle buttons for a multi-select filter (or, with a two-option `options` list and no
 * "All" entry, a plain single-select view switch) — pulled out of TamperSealLogPanel so Joint Pack
 * Photos' gallery filters and view-mode toggle can reuse the same look instead of duplicating it. */
export default function FilterButtonGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: string[]
  selected: Set<string>
  onToggle: (value: string) => void
}) {
  return (
    <div className="ts-filter-group">
      <span className="ts-filter-label">{label}:</span>
      {options.map((opt) => (
        <button key={opt} type="button" className={`ts-filter-btn${selected.has(opt) ? ' active' : ''}`} onClick={() => onToggle(opt)}>
          {opt}
        </button>
      ))}
    </div>
  )
}
