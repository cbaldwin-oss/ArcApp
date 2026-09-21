import { useEffect, useMemo, useState } from 'react'
import { Camera, RefreshCw, Save } from 'lucide-react'
import { useGetEquipmentAttributes, useSaveAssetAttributes } from '../../../lib/api'
import type { AssetAttributeRow } from '../../../lib/api'
import MultiBoxOcrModal from './MultiBoxOcrModal'

const ASSET_NAME_KEYS = ['Asset Name', 'Asset']

function assetNameOf(row: AssetAttributeRow): string {
  for (const k of ASSET_NAME_KEYS) if (row[k]) return row[k]
  return ''
}

function isTbd(value: string): boolean {
  const t = value.trim().toUpperCase()
  return t === '' || t === 'TBD'
}

type AttrEntry = { key: string; display: string; value: string }
type Group = { name: string; entries: AttrEntry[] }

/** Splits "Group: Attribute" keys into { group, display } — ungrouped keys land under "General". */
function groupAttributes(row: AssetAttributeRow): Group[] {
  const groups = new Map<string, AttrEntry[]>()
  for (const [key, value] of Object.entries(row)) {
    if (ASSET_NAME_KEYS.includes(key)) continue
    const colon = key.indexOf(':')
    const groupName = colon !== -1 ? key.slice(0, colon).trim() : 'General'
    const display = colon !== -1 ? key.slice(colon + 1).trim() : key
    if (!groups.has(groupName)) groups.set(groupName, [])
    groups.get(groupName)!.push({ key, display, value })
  }
  return Array.from(groups.entries())
    .map(([name, entries]) => ({ name, entries }))
    .sort((a, b) => (a.name === 'General' ? -1 : b.name === 'General' ? 1 : a.name.localeCompare(b.name)))
}

export default function AssetAttributesManager({ canEdit }: { canEdit: boolean }) {
  const fn = useGetEquipmentAttributes()
  const saveFn = useSaveAssetAttributes()

  useEffect(() => {
    void fn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = fn.data ?? []
  const state = fn.error ? 'error' : fn.loading || !fn.data ? 'loading' : 'ready'

  const [search, setSearch] = useState('')
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [ocrGroup, setOcrGroup] = useState<Group | null>(null)

  const selectedRow = useMemo(
    () => (selectedAsset ? rows.find((r) => assetNameOf(r) === selectedAsset) ?? null : null),
    [rows, selectedAsset],
  )

  // Reset the editable copy whenever a different asset is selected (or its data reloads).
  useEffect(() => {
    setForm(selectedRow ? { ...selectedRow } : {})
    setError('')
    setSaved(false)
  }, [selectedRow])

  const assets = useMemo(
    () => Array.from(new Set(rows.map(assetNameOf).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [rows],
  )
  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? assets.filter((a) => a.toLowerCase().includes(q)) : assets
  }, [assets, search])

  const groups = useMemo(() => groupAttributes(form), [form])
  const dirty = useMemo(
    () => !!selectedRow && Object.keys(form).some((k) => (form[k] ?? '') !== (selectedRow[k] ?? '')),
    [form, selectedRow],
  )

  function applyOcrResults(results: Array<{ key: string; text: string }>) {
    if (!results.length) return
    setForm((f) => {
      const next = { ...f }
      for (const r of results) next[r.key] = r.text
      return next
    })
    setSaved(false)
  }

  async function save() {
    if (!selectedRow || !selectedAsset) return
    const changes = Object.keys(form)
      .filter((k) => (form[k] ?? '') !== (selectedRow[k] ?? ''))
      .map((k) => ({ attribute: k, newValue: form[k] ?? '' }))
    if (!changes.length) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await saveFn.trigger({ assetName: selectedAsset, changes }).result
      await fn.trigger()
      setSaved(true)
    } catch (err) {
      setError('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel" id="attributes">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Asset Attributes</h2>
          <span className="panel-count">{state === 'ready' ? `${assets.length} assets` : '—'}</span>
        </div>
        <div className="panel-header-right">
          <button className={fn.loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={() => void fn.trigger()} aria-label="Refresh asset attributes">
            <RefreshCw />
          </button>
        </div>
      </div>
      <div className="sync-note">
        Nameplate/spec data per asset, from the same Google Sheet LaunchPad's Asset Attributes page
        reads — grouped by the sheet's own "Group: Attribute" column headers.
        {!canEdit ? ' Sign in as an authorized editor to edit.' : ''}
      </div>

      <div className="panel-body">
        {state === 'loading' && <div className="q-hint">Loading…</div>}
        {state === 'error' && (
          <div className="table-error" style={{ padding: '16px 0' }}>
            Couldn&apos;t load asset attributes ({fn.error}).
            <br />
            <button className="retry-btn" onClick={() => void fn.trigger()}>
              Retry
            </button>
          </div>
        )}

        {state === 'ready' && (
          <div className="attr-layout">
            <div className="attr-sidebar">
              <div className="attr-sidebar-search">
                <input type="text" placeholder="Search assets…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="attr-sidebar-list">
                {filteredAssets.length === 0 && <div className="wf-order-empty">No matching assets.</div>}
                {filteredAssets.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`attr-asset-btn${selectedAsset === a ? ' active' : ''}`}
                    onClick={() => setSelectedAsset(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div className="attr-detail">
              {!selectedRow ? (
                <div className="attr-detail-empty">Select an asset from the directory to view its attributes.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, color: 'var(--green)', fontSize: 20 }}>{selectedAsset}</h3>
                    {canEdit && (
                      <button className="seal-submit-btn" style={{ maxWidth: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} disabled={!dirty || saving} onClick={save}>
                        <Save style={{ width: 14, height: 14 }} />
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                    )}
                  </div>
                  {error && <div className="q-hint err" style={{ marginBottom: 14 }}>{error}</div>}
                  {saved && !dirty && <div className="q-hint ok" style={{ marginBottom: 14 }}>Saved.</div>}

                  {groups.map((g) => (
                    <div className="attr-group" key={g.name}>
                      <div className="attr-group-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{g.name}</span>
                        {canEdit && (
                          <button
                            type="button"
                            className="wf-link-btn"
                            style={{ display: 'flex', alignItems: 'center', gap: 5, textTransform: 'none', letterSpacing: 0 }}
                            onClick={() => setOcrGroup(g)}
                          >
                            <Camera style={{ width: 13, height: 13 }} /> Scan Photo
                          </button>
                        )}
                      </div>
                      <div className="attr-grid">
                        {g.entries.map((entry) => {
                          const value = form[entry.key] ?? ''
                          return (
                            <div className={`attr-field${isTbd(value) ? ' tbd' : ''}`} key={entry.key}>
                              <label title={entry.key}>{entry.display}</label>
                              <input
                                type="text"
                                value={value}
                                disabled={!canEdit}
                                onChange={(e) => setForm((f) => ({ ...f, [entry.key]: e.target.value }))}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {ocrGroup && selectedAsset && (
        <MultiBoxOcrModal
          assetName={selectedAsset}
          groupName={ocrGroup.name}
          entries={ocrGroup.entries.map((e) => ({ key: e.key, display: e.display }))}
          onApply={applyOcrResults}
          onClose={() => setOcrGroup(null)}
        />
      )}
    </section>
  )
}
