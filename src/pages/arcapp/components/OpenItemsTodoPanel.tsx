import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import {
  cxAlloyChecklistUrl,
  cxAlloyIssueUrl,
  useGetItemAssignments,
  useGetOpenChecklists,
  useGetOpenIssues,
  useSaveItemAssignments,
} from '../../../lib/api'
import type { ChecklistRow, IssueRow, ItemAssignment, ItemType } from '../../../lib/api'
import type { ShellContext } from '../ShellContext'
import type { Team } from '../types'
import { todoAssignmentLabel } from '../utils'
import AssignPopover from './AssignPopover'
import type { AssignResult } from './AssignPopover'

type OItem = {
  id: string
  title: string
  subtitle: string
  status: string
  link: string
  cxAssignedName: string
}

function checklistToItem(r: ChecklistRow): OItem {
  return {
    id: r.checklist_id,
    title: r.number ? `${r.number} — ${r.name}` : r.name,
    subtitle: [r.asset_name, r.type_name, r.discipline].filter(Boolean).join(' · '),
    status: r.status,
    link: cxAlloyChecklistUrl(r.checklist_id),
    cxAssignedName: r.assigned_name,
  }
}
function issueToItem(r: IssueRow): OItem {
  return {
    id: r.issue_id,
    title: r.name,
    subtitle: [r.asset_name, r.priority].filter(Boolean).join(' · '),
    status: r.status,
    link: cxAlloyIssueUrl(r.issue_id),
    cxAssignedName: r.assigned_name,
  }
}

type PopoverState = { top: number; left: number; itemIds: string[]; initial?: AssignResult }

/** How many rows render at a time before "Show more" — an open-status pick can realistically
 * match thousands of rows (a whole project's worth of "Not Started" checklists), so nothing here
 * assumes the list is to-do-sized. */
const PAGE_SIZE = 100

function OpenItemsSection({
  title,
  itemType,
  items,
  loading,
  error,
  onRetry,
  configuredEmpty,
  assignmentsByItemId,
  teams,
  onAssign,
}: {
  title: string
  itemType: ItemType
  items: OItem[]
  loading: boolean
  error: string
  onRetry: () => void
  configuredEmpty: boolean
  assignmentsByItemId: Map<string, ItemAssignment>
  teams: Team[]
  onAssign: (items: Array<{ itemType: ItemType; itemId: string }>, result: AssignResult) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [unassignedOnly, setUnassignedOnly] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // A real open-status pick can easily match several thousand rows (e.g. "Not Started" across a
  // whole project) — filtering narrows what actually renders, and pagination caps the DOM cost of
  // whatever's left after that instead of mounting every row at once.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (unassignedOnly && assignmentsByItemId.has(item.id)) return false
      if (!q) return true
      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q) ||
        item.cxAssignedName.toLowerCase().includes(q)
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, unassignedOnly, assignmentsByItemId])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search, unassignedOnly])

  const displayed = filtered.slice(0, visibleCount)
  // "Select all" operates on the full filtered set, not just the currently-rendered page — so
  // e.g. every "Not Started" checklist matching a search can be bulk-assigned in one go without
  // having to page through and select them all by hand.
  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id))

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(filtered.map((i) => i.id)) : new Set())
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function openBulkAssign(e: React.MouseEvent) {
    if (!selected.size) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPopover({ top: rect.bottom + 6, left: rect.left, itemIds: Array.from(selected) })
  }
  function openRowAssign(e: React.MouseEvent, id: string) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const a = assignmentsByItemId.get(id)
    const initial: AssignResult | undefined = a ? { teamId: a.assignedTeamId, email: a.assignedEmail, name: a.assignedName } : undefined
    let left = rect.left
    if (left + 260 > window.innerWidth) left = window.innerWidth - 270
    setPopover({ top: rect.bottom + 6, left, itemIds: [id], initial })
  }

  async function applyAssign(result: AssignResult) {
    if (!popover) return
    setBusy(true)
    try {
      await onAssign(
        popover.itemIds.map((id) => ({ itemType, itemId: id })),
        result,
      )
      if (popover.itemIds.length > 1) setSelected(new Set())
      setPopover(null)
    } catch (err) {
      window.alert('Failed to assign: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel oi-section">
      <div className="panel-header oi-clickable" onClick={() => setExpanded((v) => !v)}>
        <div className="panel-header-left">
          {expanded ? <ChevronDown style={{ width: 16, height: 16 }} /> : <ChevronRight style={{ width: 16, height: 16 }} />}
          <h2 className="panel-title">{title}</h2>
          <span className="panel-count">{loading ? '—' : `${items.length} open`}</span>
        </div>
        <div className="panel-header-right">
          <button
            className={loading ? 'icon-btn spin' : 'icon-btn'}
            title="Refresh"
            onClick={(e) => {
              e.stopPropagation()
              onRetry()
            }}
            aria-label={`Refresh ${title}`}
          >
            <RefreshCw />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="panel-body">
          {configuredEmpty && (
            <div className="q-hint">
              No statuses configured yet — pick which raw CxAlloy statuses count as &quot;still open&quot; in Settings before
              anything shows here.
            </div>
          )}
          {!configuredEmpty && loading && <div className="q-hint">Loading…</div>}
          {!configuredEmpty && error && (
            <div className="table-error">
              Couldn&apos;t load ({error}).{' '}
              <button className="retry-btn" onClick={onRetry}>
                Retry
              </button>
            </div>
          )}
          {!configuredEmpty && !loading && !error && items.length === 0 && <div className="q-hint">Nothing open right now.</div>}

          {!configuredEmpty && !loading && !error && items.length > 0 && (
            <>
              <div className="oi-filters">
                <input
                  type="text"
                  className="oi-search"
                  placeholder={`Search ${items.length.toLocaleString()} open ${title.split(' ')[1]?.toLowerCase() ?? 'items'}…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <label className="wf-check-row" style={{ marginBottom: 0 }}>
                  <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} />
                  Unassigned only
                </label>
              </div>

              {filtered.length === 0 ? (
                <div className="q-hint">No items match.</div>
              ) : (
                <>
                  <div className="oi-toolbar">
                    <label className="wf-check-row" style={{ marginBottom: 0 }}>
                      <input type="checkbox" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} />
                      Select all {filtered.length !== items.length ? `(${filtered.length.toLocaleString()} matching)` : ''}
                    </label>
                    <span className="q-hint" style={{ margin: 0 }}>
                      {selected.size.toLocaleString()} selected
                    </span>
                    <button type="button" className="panel-action-btn" disabled={!selected.size || busy} onClick={openBulkAssign}>
                      Assign selected
                    </button>
                  </div>

                  <div className="oi-rows">
                    {displayed.map((item) => {
                      const a = assignmentsByItemId.get(item.id)
                      const label =
                        todoAssignmentLabel({ assignedTeamId: a?.assignedTeamId ?? null, assignedEmail: a?.assignedEmail ?? null, assignedName: a?.assignedName ?? null }, teams) ||
                        'Unassigned'
                      return (
                        <div className="oi-row" key={item.id}>
                          <input type="checkbox" checked={selected.has(item.id)} onChange={(e) => toggleOne(item.id, e.target.checked)} />
                          <div className="oi-main">
                            <a className="oi-title" href={item.link} target="_blank" rel="noreferrer">
                              {item.title}
                            </a>
                            <div className="oi-meta">
                              {item.subtitle && <span>{item.subtitle}</span>}
                              <span className="tag norm">{item.status}</span>
                              {item.cxAssignedName && <span title="CxAlloy's own assignment, unrelated to ArcApp teams">CxAlloy: {item.cxAssignedName}</span>}
                            </div>
                          </div>
                          <button type="button" className="oi-assign-chip" disabled={busy} onClick={(e) => openRowAssign(e, item.id)}>
                            {label}
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {displayed.length < filtered.length && (
                    <button type="button" className="retry-btn" style={{ marginTop: 12 }} onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                      Show {Math.min(PAGE_SIZE, filtered.length - displayed.length).toLocaleString()} more (
                      {(filtered.length - displayed.length).toLocaleString()} remaining)
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {popover && (
        <AssignPopover
          top={popover.top}
          left={popover.left}
          teams={teams}
          itemCount={popover.itemIds.length}
          initial={popover.initial}
          onApply={applyAssign}
          onClose={() => setPopover(null)}
        />
      )}
    </section>
  )
}

/** Auto-generated to-do sections for still-open Checklists/Issues (read-only CxAlloy sheet data)
 * — each toggled on independently in Settings, each expandable to show/reassign every instance,
 * individually or via multi-select. Assignment itself is stored in arcapp_item_assignments,
 * keyed by CxAlloy id, since the sheet data itself can't be written back to. */
export default function OpenItemsTodoPanel() {
  const ctx = useOutletContext<ShellContext>()
  const { checklistTodoEnabled, issueTodoEnabled, checklistOpenStatuses, issueOpenStatuses, teams } = ctx

  const checklistsFn = useGetOpenChecklists()
  const issuesFn = useGetOpenIssues()
  const assignmentsFn = useGetItemAssignments()
  const saveFn = useSaveItemAssignments()

  useEffect(() => {
    if (checklistTodoEnabled) void checklistsFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistTodoEnabled, checklistOpenStatuses.join('|')])

  useEffect(() => {
    if (issueTodoEnabled) void issuesFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueTodoEnabled, issueOpenStatuses.join('|')])

  useEffect(() => {
    if (checklistTodoEnabled || issueTodoEnabled) void assignmentsFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistTodoEnabled, issueTodoEnabled])

  const assignments = useMemo(() => assignmentsFn.data ?? [], [assignmentsFn.data])
  const checklistAssignments = useMemo(() => new Map(assignments.filter((a) => a.itemType === 'checklist').map((a) => [a.itemId, a])), [assignments])
  const issueAssignments = useMemo(() => new Map(assignments.filter((a) => a.itemType === 'issue').map((a) => [a.itemId, a])), [assignments])

  async function onAssign(items: Array<{ itemType: ItemType; itemId: string }>, result: AssignResult) {
    await saveFn.trigger({ items, assignedTeamId: result.teamId, assignedEmail: result.email, assignedName: result.name }).result
    void assignmentsFn.trigger()
  }

  if (!checklistTodoEnabled && !issueTodoEnabled) return null

  const checklistItems = (checklistsFn.data?.rows ?? []).map(checklistToItem)
  const issueItems = (issuesFn.data?.rows ?? []).map(issueToItem)

  return (
    <>
      {checklistTodoEnabled && (
        <OpenItemsSection
          title="Open Checklists"
          itemType="checklist"
          items={checklistItems}
          loading={checklistsFn.loading}
          error={checklistsFn.error ?? ''}
          onRetry={() => void checklistsFn.trigger()}
          configuredEmpty={!checklistOpenStatuses.length}
          assignmentsByItemId={checklistAssignments}
          teams={teams}
          onAssign={onAssign}
        />
      )}
      {issueTodoEnabled && (
        <OpenItemsSection
          title="Open Issues"
          itemType="issue"
          items={issueItems}
          loading={issuesFn.loading}
          error={issuesFn.error ?? ''}
          onRetry={() => void issuesFn.trigger()}
          configuredEmpty={!issueOpenStatuses.length}
          assignmentsByItemId={issueAssignments}
          teams={teams}
          onAssign={onAssign}
        />
      )}
    </>
  )
}
