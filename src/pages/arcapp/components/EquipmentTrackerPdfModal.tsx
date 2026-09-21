import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { EquipmentTrackerConfig, EquipmentTrackerRow } from '../../../lib/api'
import { PDF_OPTIONS, gateCellsForPdf, groupedIssuesForPdf, groupedSupportForPdf, type MaxCols, type PdfOption } from '../lib/equipmentTracker'

type Props = {
  rows: EquipmentTrackerRow[]
  maxCols: MaxCols
  config: EquipmentTrackerConfig
  siteLabel: string
  onClose: () => void
}

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function labelFor(opt: PdfOption, config: EquipmentTrackerConfig): string {
  switch (opt.id) {
    case 'area':
      return config.customHeaders.areaPrefix || 'Area'
    case 'l2-gate':
      return config.customHeaders.l2Gate
    case 'l2-status':
      return config.customHeaders.l2Status
    case 'l3-gate':
      return config.customHeaders.l3Gate
    case 'l3-status':
      return config.customHeaders.l3Status
    case 'l4-gate':
      return config.customHeaders.l4Gate
    case 'l4-status':
      return config.customHeaders.l4Status
    default:
      return opt.label
  }
}

/** Column-picker modal that opens a plain print window with a table built straight from the
 * currently-filtered row data (not by scraping the rendered grid's DOM, unlike the LaunchPad
 * reference this was ported from) and calls window.print() on it. */
export default function EquipmentTrackerPdfModal({ rows, maxCols, config, siteLabel, onClose }: Props) {
  const availableOptions = PDF_OPTIONS.filter((opt) => {
    if (opt.id === 'l2-gate' && config.showL2Gate === false) return false
    if (opt.id === 'l3-gate' && config.showL3Gate === false) return false
    if (opt.id === 'l4-gate' && config.showL4Gate === false) return false
    if ((opt.id === 'l2-open' || opt.id === 'l2-closed') && config.showL2Supp === false) return false
    if ((opt.id === 'l3-open' || opt.id === 'l3-closed') && config.showL3Supp === false) return false
    if ((opt.id === 'l4-open' || opt.id === 'l4-closed') && config.showL4Supp === false) return false
    return true
  })
  const [selected, setSelected] = useState<Set<string>>(() => new Set(availableOptions.map((o) => o.id)))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function generate() {
    const chosen = availableOptions.filter((o) => selected.has(o.id))
    if (!chosen.length) {
      alert('Select at least one column.')
      return
    }
    const win = window.open('', '_blank')
    if (!win) return

    const rowsHtml = rows
      .map((row) => {
        const cells = chosen.map((opt) => {
          switch (opt.type) {
            case 'asset': {
              const asset = row['Asset'] || ''
              const link = row['Asset_Link']
              const body = link ? `<a href="${escapeHtml(link)}">${escapeHtml(asset)}</a>` : escapeHtml(asset)
              return `<td class="uncolored">${body}</td>`
            }
            case 'area':
              return `<td>${escapeHtml(row['Area'] || 'N/A')}</td>`
            case 'gate': {
              const count = opt.level === 'l2' ? maxCols.l2Gate : opt.level === 'l3' ? maxCols.l3Gate : maxCols.l4Gate
              return `<td class="uncolored">${escapeHtml(gateCellsForPdf(row, opt.level!, count))}</td>`
            }
            case 'status': {
              const key = opt.level === 'l2' ? 'L2 Overall Status' : opt.level === 'l3' ? 'L3 Overall Status' : 'L4 Overall Status'
              return `<td>${escapeHtml(row[key] || 'N/A')}</td>`
            }
            case 'supp-open': {
              const count = opt.level === 'l2' ? maxCols.l2 : opt.level === 'l3' ? maxCols.l3 : maxCols.l4
              return `<td>${escapeHtml(groupedSupportForPdf(row, opt.level!, count, 'open', config))}</td>`
            }
            case 'supp-closed': {
              const count = opt.level === 'l2' ? maxCols.l2 : opt.level === 'l3' ? maxCols.l3 : maxCols.l4
              return `<td>${escapeHtml(groupedSupportForPdf(row, opt.level!, count, 'closed', config))}</td>`
            }
            case 'iss-group':
              return `<td>${escapeHtml(groupedIssuesForPdf(row, maxCols.iss, opt.group!, config))}</td>`
            default:
              return '<td>-</td>'
          }
        })
        return `<tr>${cells.join('')}</tr>`
      })
      .join('')

    const headHtml = chosen.map((opt) => `<th>${escapeHtml(labelFor(opt, config))}</th>`).join('')

    win.document.write(`<!DOCTYPE html><html><head><title>Equipment Status Tracker Export</title>
<meta charset="utf-8">
<style>
  @page { size: landscape; margin: 10mm; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; font-size: 10px; color: #222; }
  h2 { color: #1b5e20; text-align: center; margin: 0 0 4px; font-size: 16px; text-transform: uppercase; }
  .meta { text-align: center; color: #666; font-size: 11px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #aeb6ba; padding: 5px 4px; text-align: center; vertical-align: middle; word-wrap: break-word; }
  th { background: #1b5e20 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  td.uncolored { font-weight: bold; }
  a { color: #0563c1; text-decoration: underline; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
</style></head><body>
<h2>${escapeHtml(siteLabel)} &bull; Equipment Status Tracker Export</h2>
<div class="meta">Generated ${escapeHtml(new Date().toLocaleString())} &mdash; ${rows.length} asset${rows.length === 1 ? '' : 's'}</div>
<table><thead><tr>${headHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>
</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.onafterprint = () => win.close()
      win.print()
    }, 400)
    onClose()
  }

  const modal = (
    <div className="fs-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fs-panel eq-pdf-panel">
        <div className="fs-header">
          <h2>Export to PDF</h2>
          <button className="fs-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="fs-body">
          <div className="sync-note" style={{ padding: 0, marginTop: 0, marginBottom: 14 }}>
            Exports the {rows.length} asset{rows.length === 1 ? '' : 's'} currently visible under the active filters/search.
          </div>
          <label className="eq-pdf-col-row eq-pdf-select-all">
            <input
              type="checkbox"
              checked={selected.size === availableOptions.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(availableOptions.map((o) => o.id)) : new Set())}
            />
            Select All
          </label>
          <div className="eq-pdf-col-list">
            {availableOptions.map((opt) => (
              <label key={opt.id} className="eq-pdf-col-row">
                <input type="checkbox" checked={selected.has(opt.id)} onChange={() => toggle(opt.id)} />
                {labelFor(opt, config)}
              </label>
            ))}
          </div>
        </div>
        <div className="eq-pdf-footer">
          <button type="button" className="retry-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="seal-submit-btn" style={{ maxWidth: 220 }} onClick={generate}>
            Generate &amp; Print PDF
          </button>
        </div>
      </div>
    </div>
  )
  return createPortal(modal, document.querySelector('.arcapp') ?? document.body)
}
