import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import {
  cxAlloyChecklistUrl,
  cxAlloyIssueUrl,
  useGetItemAssignments,
  useGetNetaTrackerData,
  useGetOpenChecklists,
  useGetOpenIssues,
  useSaveItemAssignments,
} from '../../../lib/api'
import type { ChecklistRow, CxAlloyLinkBase, DefaultAssignee, IssueRow, ItemAssignment, ItemType, NetaReturnedRow, NetaSubmissionRow } from '../../../lib/api'
import { hasCapability } from '../../../lib/project'
import type { ShellContext } from '../ShellContext'
import type { Team } from '../types'
import { isTodoMine, todoAssignmentLabel } from '../utils'
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

function checklistToItem(r: ChecklistRow, linkBase: CxAlloyLinkBase | null): OItem {
  return {
    id: r.checklist_id,
    title: r.number ? `${r.number} — ${r.name}` : r.name,
    subtitle: [r.asset_name, r.type_name, r.discipline].filter(Boolean).join(' · '),
    status: r.status,
    link: cxAlloyChecklistUrl(r.checklist_id, linkBase),
    cxAssignedName: r.assigned_name,
  }
}
function issueToItem(r: IssueRow, linkBase: CxAlloyLinkBase | null): OItem {
  return {
    id: r.issue_id,
    title: r.name,
    subtitle: [r.asset_name, r.priority].filter(Boolean).join(' · '),
    status: r.status,
    link: cxAlloyIssueUrl(r.issue_id, linkBase),
    cxAssignedName: r.assigned_name,
  }
}

// NETA rows have no CxAlloy-style stable id — the sheet row number shifts whenever the Document
// Importer re-crawls Drive and rebuilds the grid, so documentName (a real Drive filename, stable
// across re-imports) is used as the assignment key instead. `link` is the row's own Document Link
// (a real Drive file URL, from the same =HYPERLINK(...) parsing the NETA Tracker page uses).
function netaSubmissionToItem(r: NetaSubmissionRow): OItem {
  return {
    id: r.documentName,
    title: r.documentName,
    subtitle: [r.area, r.category].filter(Boolean).join(' · '),
    status: r.folderLocation,
    link: r.documentLinkUrl,
    cxAssignedName: '',
  }
}
function netaReturnedToItem(r: NetaReturnedRow): OItem {
  return {
    id: r.documentName,
    title: r.documentName,
    subtitle: [r.area, r.category].filter(Boolean).join(' · '),
    status: r.issues && r.issues.toLowerCase() !== 'none' ? r.issues : r.folderLocation,
    link: r.documentLinkUrl,
    cxAssignedName: '',
  }
}

type PopoverState = { top: number; left: number; itemIds: string[]; initial?: AssignResult }

/** How many rows render at a time before "Show more" — an open-status pick can realistically
 * match thousands of rows (a whole project's worth of "Not Started" checklists), so nothing here
 * assumes the list is to-do-sized. */
const PAGE_SIZE = 100

/** DOM id for each section — used by the "My Tasks" default-assignee summary cards to scroll to
 * (and, via expandSignal below) auto-expand the matching section when clicked. */
export function sectionDomId(itemType: ItemType): string {
  return `oi-section-${itemType}`
}

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
  expandSignal,
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
  /** Bumped by a "My Tasks" summary card's click (see requestExpand in useOpenItemsData) to force
   * this section open even though it's collapsed by default — an increasing number rather than a
   * boolean so clicking it again while already expanded still registers as a fresh request. */
  expandSignal?: number
}) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (expandSignal) setExpanded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandSignal])
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
    <section className="panel oi-section" id={sectionDomId(itemType)}>
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
              Every known CxAlloy status is currently marked &quot;ready&quot;/&quot;for review&quot; in Settings, so
              there&apos;s nothing left to count as still open.
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
                  placeholder={`Search ${items.length.toLocaleString()} open ${title.replace(/^Open\s*/i, '').toLowerCase() || 'items'}…`}
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

export type MyItemEntry = { item: OItem; itemType: ItemType; typeLabel: string; assignment: ItemAssignment }
/** A category-level roll-up card ("Issues need to be reviewed (12 open)") shown in "My Tasks" when
 * that category's Settings-configured default assignee is you (or a team you're on) — see
 * mySummaries in useOpenItemsData. Not tied to any individual item, so there's no `assignment`. */
export type MySummaryEntry = { itemType: ItemType; title: string; count: number }
type MyPopoverState = { top: number; left: number; itemType: ItemType; itemId: string; initial: AssignResult }

/**
 * Renders one "assigned to me" row — used inline inside "Your To-Dos" (TodoPage.tsx) under the
 * "My Tasks" tab, NOT as its own separate section (a standalone "Assigned to You" panel next to
 * "Your To-Dos" read as a duplicate "my stuff" list — this folds into the one that already
 * existed instead). Reassigning from here still uses the normal AssignPopover, so a person can
 * hand something off to someone else or a team without leaving their own to-do list.
 */
export function MyItemRow({ entry, teams, onAssign }: { entry: MyItemEntry; teams: Team[]; onAssign: (items: Array<{ itemType: ItemType; itemId: string }>, result: AssignResult) => Promise<void> }) {
  const [popover, setPopover] = useState<MyPopoverState | null>(null)
  const [busy, setBusy] = useState(false)

  function openRowAssign(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    let left = rect.left
    if (left + 260 > window.innerWidth) left = window.innerWidth - 270
    const a = entry.assignment
    setPopover({
      top: rect.bottom + 6,
      left,
      itemType: entry.itemType,
      itemId: entry.item.id,
      initial: { teamId: a.assignedTeamId, email: a.assignedEmail, name: a.assignedName },
    })
  }

  async function applyAssign(result: AssignResult) {
    if (!popover) return
    setBusy(true)
    try {
      await onAssign([{ itemType: popover.itemType, itemId: popover.itemId }], result)
      setPopover(null)
    } catch (err) {
      window.alert('Failed to reassign: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="oi-row">
      <div className="oi-main">
        <a className="oi-title" href={entry.item.link} target="_blank" rel="noreferrer">
          {entry.item.title}
        </a>
        <div className="oi-meta">
          <span className="tag norm">{entry.typeLabel}</span>
          {entry.item.subtitle && <span>{entry.item.subtitle}</span>}
          {entry.item.status && <span className="tag norm">{entry.item.status}</span>}
        </div>
      </div>
      <button type="button" className="oi-assign-chip" disabled={busy} onClick={openRowAssign}>
        {todoAssignmentLabel(entry.assignment, teams) || 'Reassign'}
      </button>
      {popover && (
        <AssignPopover
          top={popover.top}
          left={popover.left}
          teams={teams}
          itemCount={1}
          initial={popover.initial}
          onApply={applyAssign}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  )
}

/**
 * One category-level roll-up card ("Issues need to be reviewed · 12 open") — rendered in "My
 * Tasks" when Settings has a default assignee configured for that category and it matches the
 * signed-in user (or a team they're on). Unlike MyItemRow, this isn't a real, individually
 * assignable item — clicking it just jumps to and expands the matching "Open ..." section below,
 * where the actual items live (and can still be assigned to someone specific from there).
 */
export function MySummaryCard({ entry, onExpand }: { entry: MySummaryEntry; onExpand: (itemType: ItemType) => void }) {
  function go() {
    onExpand(entry.itemType)
    document.getElementById(sectionDomId(entry.itemType))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <div className="oi-row">
      <div className="oi-main">
        <button type="button" className="oi-title" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={go}>
          {entry.title}
        </button>
        <div className="oi-meta">
          <span className="tag norm">{entry.count.toLocaleString()} open</span>
        </div>
      </div>
    </div>
  )
}

/**
 * All the data the four "Open ..." sections AND the "Assigned to You" rows inside "Your To-Dos"
 * need, fetched exactly once — TodoPage.tsx calls this and passes the result to both, so nothing
 * here gets fetched twice (an open-status pick can be thousands of rows; doubling that would be
 * wasteful, not just untidy).
 */
export function useOpenItemsData() {
  const ctx = useOutletContext<ShellContext>()
  const {
    checklistTodoEnabled,
    issueTodoEnabled,
    netaSubmissionsTodoEnabled,
    netaReturnedTodoEnabled,
    checklistDefaultAssignee,
    issueDefaultAssignee,
    netaSubmissionsDefaultAssignee,
    netaReturnedDefaultAssignee,
    teams,
    currentUserEmail,
    cxAlloyLinkBase,
  } = ctx

  // Bumped by a "My Tasks" summary card's click to force the matching "Open ..." section open
  // (it's collapsed by default) — see sectionDomId/expandSignal on OpenItemsSection above.
  const [expandSignals, setExpandSignals] = useState<Record<ItemType, number>>({
    checklist: 0,
    issue: 0,
    neta_submission: 0,
    neta_returned: 0,
  })
  function requestExpand(itemType: ItemType) {
    setExpandSignals((prev) => ({ ...prev, [itemType]: prev[itemType] + 1 }))
  }
  // NETA Tracker is STY4-only (see the `netaTracker` capability in src/lib/project.ts) — even
  // though the Settings toggles above are project-scoped and shouldn't stay on after a switch,
  // this is the same defense-in-depth every other NETA consumer applies.
  const netaAvailable = hasCapability('netaTracker')
  const netaSubmissionsOn = netaSubmissionsTodoEnabled && netaAvailable
  const netaReturnedOn = netaReturnedTodoEnabled && netaAvailable

  const checklistsFn = useGetOpenChecklists()
  const issuesFn = useGetOpenIssues()
  const netaFn = useGetNetaTrackerData()
  const assignmentsFn = useGetItemAssignments()
  const saveFn = useSaveItemAssignments()

  useEffect(() => {
    if (checklistTodoEnabled) void checklistsFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistTodoEnabled])

  useEffect(() => {
    if (issueTodoEnabled) void issuesFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueTodoEnabled])

  // Both NETA sections read the same underlying fetch (one Apps Script call returns both tabs) —
  // triggering once here means "refresh" on either section refreshes both, which matches reality
  // better than two independent fetches would.
  useEffect(() => {
    if (netaSubmissionsOn || netaReturnedOn) void netaFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netaSubmissionsOn, netaReturnedOn])

  useEffect(() => {
    if (checklistTodoEnabled || issueTodoEnabled || netaSubmissionsOn || netaReturnedOn) void assignmentsFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistTodoEnabled, issueTodoEnabled, netaSubmissionsOn, netaReturnedOn])

  const assignments = useMemo(() => assignmentsFn.data ?? [], [assignmentsFn.data])
  const checklistAssignments = useMemo(() => new Map(assignments.filter((a) => a.itemType === 'checklist').map((a) => [a.itemId, a])), [assignments])
  const issueAssignments = useMemo(() => new Map(assignments.filter((a) => a.itemType === 'issue').map((a) => [a.itemId, a])), [assignments])
  const netaSubmissionAssignments = useMemo(
    () => new Map(assignments.filter((a) => a.itemType === 'neta_submission').map((a) => [a.itemId, a])),
    [assignments],
  )
  const netaReturnedAssignments = useMemo(
    () => new Map(assignments.filter((a) => a.itemType === 'neta_returned').map((a) => [a.itemId, a])),
    [assignments],
  )

  async function onAssign(items: Array<{ itemType: ItemType; itemId: string }>, result: AssignResult) {
    await saveFn.trigger({ items, assignedTeamId: result.teamId, assignedEmail: result.email, assignedName: result.name }).result
    void assignmentsFn.trigger()
  }

  const checklistItems = (checklistsFn.data?.rows ?? []).map((r) => checklistToItem(r, cxAlloyLinkBase))
  const issueItems = (issuesFn.data?.rows ?? []).map((r) => issueToItem(r, cxAlloyLinkBase))
  // "Still open" here mirrors the NETA Tracker page's own default filtering exactly — not
  // yet Submitted to Google (Submissions) / not yet Uploaded to ACC (Returned Files). A row whose
  // Uploaded to ACC is "N/A" (open issue, see NetaTrackerScript.gs) is correctly still "open" —
  // it needs MORE attention, not less, so `!== true` rather than a falsy check.
  const netaSubmissionItems = (netaFn.data?.submissions ?? []).filter((r) => !r.submittedToGoogle).map(netaSubmissionToItem)
  const netaReturnedItems = (netaFn.data?.returnedFiles ?? []).filter((r) => r.uploadedToAcc !== true).map(netaReturnedToItem)

  // "Assigned to You" (rendered inside "Your To-Dos") is a personalized re-filter of these same
  // four lists — it changes nothing about what the four "Open ..." sections below show everyone
  // else; an item assigned to someone stays fully visible there too, unfiltered.
  const myItems: MyItemEntry[] = currentUserEmail
    ? [
        ...checklistItems.flatMap((item) => {
          const a = checklistAssignments.get(item.id)
          return a && isTodoMine(a, currentUserEmail, teams) ? [{ item, itemType: 'checklist' as ItemType, typeLabel: 'Checklist', assignment: a }] : []
        }),
        ...issueItems.flatMap((item) => {
          const a = issueAssignments.get(item.id)
          return a && isTodoMine(a, currentUserEmail, teams) ? [{ item, itemType: 'issue' as ItemType, typeLabel: 'Issue', assignment: a }] : []
        }),
        ...netaSubmissionItems.flatMap((item) => {
          const a = netaSubmissionAssignments.get(item.id)
          return a && isTodoMine(a, currentUserEmail, teams)
            ? [{ item, itemType: 'neta_submission' as ItemType, typeLabel: 'NETA Submission', assignment: a }]
            : []
        }),
        ...netaReturnedItems.flatMap((item) => {
          const a = netaReturnedAssignments.get(item.id)
          return a && isTodoMine(a, currentUserEmail, teams)
            ? [{ item, itemType: 'neta_returned' as ItemType, typeLabel: 'NETA Returned', assignment: a }]
            : []
        }),
      ]
    : []

  // Settings → per-category "default assignee" (requested 2026-09-24): a single roll-up card per
  // category, not per-item assignment — shows only when that category's default is you (or a team
  // you're on) AND there's at least one open item, so it disappears once the category's actually
  // clear instead of lingering as a stale reminder.
  const isDefaultMine = (a: DefaultAssignee) => isTodoMine({ assignedEmail: a.email, assignedTeamId: a.teamId }, currentUserEmail, teams)
  const mySummaries: MySummaryEntry[] = currentUserEmail
    ? [
        ...(checklistTodoEnabled && checklistItems.length > 0 && isDefaultMine(checklistDefaultAssignee)
          ? [{ itemType: 'checklist' as ItemType, title: 'Checklists need to be reviewed', count: checklistItems.length }]
          : []),
        ...(issueTodoEnabled && issueItems.length > 0 && isDefaultMine(issueDefaultAssignee)
          ? [{ itemType: 'issue' as ItemType, title: 'Issues need to be reviewed', count: issueItems.length }]
          : []),
        ...(netaSubmissionsOn && netaSubmissionItems.length > 0 && isDefaultMine(netaSubmissionsDefaultAssignee)
          ? [{ itemType: 'neta_submission' as ItemType, title: 'NETA Submissions need to be reviewed', count: netaSubmissionItems.length }]
          : []),
        ...(netaReturnedOn && netaReturnedItems.length > 0 && isDefaultMine(netaReturnedDefaultAssignee)
          ? [{ itemType: 'neta_returned' as ItemType, title: 'NETA Returned Files need to be reviewed', count: netaReturnedItems.length }]
          : []),
      ]
    : []

  return {
    checklistTodoEnabled,
    issueTodoEnabled,
    netaSubmissionsOn,
    netaReturnedOn,
    checklistsFn,
    issuesFn,
    netaFn,
    checklistItems,
    issueItems,
    netaSubmissionItems,
    netaReturnedItems,
    checklistAssignments,
    issueAssignments,
    netaSubmissionAssignments,
    netaReturnedAssignments,
    myItems,
    mySummaries,
    expandSignals,
    requestExpand,
    onAssign,
  }
}

export type OpenItemsData = ReturnType<typeof useOpenItemsData>

/** Auto-generated to-do sections for still-open Checklists/Issues (read-only CxAlloy sheet data)
 * — each toggled on independently in Settings, each expandable to show/reassign every instance,
 * individually or via multi-select. Assignment itself is stored in arcapp_item_assignments,
 * keyed by CxAlloy id, since the sheet data itself can't be written back to. Data comes in as a
 * prop (from useOpenItemsData, called once in TodoPage.tsx) rather than being fetched here, so
 * "Assigned to You" inside "Your To-Dos" can share it without a second, duplicate fetch. */
export default function OpenItemsTodoPanel({ data, teams }: { data: OpenItemsData; teams: Team[] }) {
  const {
    checklistTodoEnabled,
    issueTodoEnabled,
    netaSubmissionsOn,
    netaReturnedOn,
    checklistsFn,
    issuesFn,
    netaFn,
    checklistItems,
    issueItems,
    netaSubmissionItems,
    netaReturnedItems,
    checklistAssignments,
    issueAssignments,
    netaSubmissionAssignments,
    netaReturnedAssignments,
    expandSignals,
    onAssign,
  } = data

  if (!checklistTodoEnabled && !issueTodoEnabled && !netaSubmissionsOn && !netaReturnedOn) return null

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
          configuredEmpty={!!checklistsFn.data && checklistsFn.data.openStatuses.length === 0}
          assignmentsByItemId={checklistAssignments}
          teams={teams}
          onAssign={onAssign}
          expandSignal={expandSignals.checklist}
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
          configuredEmpty={!!issuesFn.data && issuesFn.data.openStatuses.length === 0}
          assignmentsByItemId={issueAssignments}
          teams={teams}
          onAssign={onAssign}
          expandSignal={expandSignals.issue}
        />
      )}
      {netaSubmissionsOn && (
        <OpenItemsSection
          title="Open NETA Submissions"
          itemType="neta_submission"
          items={netaSubmissionItems}
          loading={netaFn.loading}
          error={netaFn.error ?? ''}
          onRetry={() => void netaFn.trigger()}
          configuredEmpty={false}
          assignmentsByItemId={netaSubmissionAssignments}
          teams={teams}
          onAssign={onAssign}
          expandSignal={expandSignals.neta_submission}
        />
      )}
      {netaReturnedOn && (
        <OpenItemsSection
          title="Open NETA Returned Files"
          itemType="neta_returned"
          items={netaReturnedItems}
          loading={netaFn.loading}
          error={netaFn.error ?? ''}
          onRetry={() => void netaFn.trigger()}
          configuredEmpty={false}
          assignmentsByItemId={netaReturnedAssignments}
          teams={teams}
          onAssign={onAssign}
          expandSignal={expandSignals.neta_returned}
        />
      )}
    </>
  )
}
