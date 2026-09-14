/* Date + formatting helpers ported from the original ArcApp dashboard. */

// Local calendar date as YYYY-MM-DD — deliberately NOT toISOString(), which
// converts to UTC and can roll to the next day in the evening for US time zones.
export function localIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function stripHtml(str: unknown): string {
  return (str || '').toString().replace(/<[^>]+>/g, '').trim()
}

export function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localIsoDate(d)
}

export function fmtDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtDateLong(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function scheduleStatusClass(text: string): string {
  const t = (text || '').toLowerCase()
  if (!t || t === 'na') return 'muted'
  if (t.includes('complete') || t.includes('pass')) return 'complete'
  if (t.includes('hold') || t.includes('fail') || t.includes('issue')) return 'hold'
  if (t.includes('caution') || t.includes('risk') || t.includes('delay')) return 'caution'
  return 'go'
}

export function statusColor(status: string): string {
  const map: Record<string, string> = { go: '#3fe382', caution: '#f0a840', hold: '#ff5c56', complete: '#3fe382' }
  return map[status] ?? '#3fe382'
}

// Clean 2-decimal-max display without trailing zeros (1.00 -> 1, 1.25 -> 1.25).
export function fmtOffset(v: number): string {
  const n = Math.round(v * 100) / 100
  return n.toString()
}

// Full seal-number strings (not bare numbers) — a seal range can include a letter prefix/suffix
// (see parseSealNumberParts), so an omitted entry only excludes a seal if it matches the whole
// thing. Comparison is case-insensitive at the call site; original casing is kept here so it can
// still be displayed back to the user as typed.
export function parseOmitted(str: string): string[] {
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Splits a seal number into a leading non-digit prefix, a numeric core, and a trailing non-digit
 * suffix — e.g. "A-1001-B" -> prefix "A-", num "1001", suffix "-B". Returns null if there's no
 * numeric core at all (a range needs something to increment). Ported from tamperseal.html so
 * seal ranges behave identically here.
 */
export function parseSealNumberParts(value: string): { prefix: string; num: string; suffix: string } | null {
  const match = String(value).trim().match(/^(\D*)(\d+)(\D*)$/)
  if (!match) return null
  return { prefix: match[1], num: match[2], suffix: match[3] }
}
