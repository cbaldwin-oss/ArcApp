import { useEffect, useMemo, useState } from 'react'
import {
  cxAlloyChecklistUrl,
  cxAlloyIssueUrl,
  useGetChecklists,
  useGetIssues,
  useGetItemAssignments,
  useGetNetaTrackerData,
  useGetOpenChecklists,
  useGetOpenIssues,
  useSaveItemAssignments,
} from '../../../lib/api'
import type { ChecklistRow, CxAlloyLinkBase, DefaultAssignee, IssueRow, ItemAssignment, ItemType, NetaReturnedRow, NetaSubmissionRow } from '../../../lib/api'
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

/** Where a default-assignee summary card's click should take you — the dedicated page that
 * already lists the real items (Checklists/Issues ready-for-review pages, NETA Tracker), since
 * there's no inline "Open ..." list on the To-Do page to expand into anymore. */
export function todoSummaryRoute(itemType: ItemType): string {
  switch (itemType) {
    case 'checklist':
      return '/checklists'
    case 'issue':
      return '/issues'
    case 'neta_submission':
    case 'neta_returned':
      return '/netatracker'
  }
}

export type MyItemEntry = { item: OItem; itemType: ItemType; typeLabel: string; assignment: ItemAssignment }
/** A category-level roll-up card ("Issues need to be reviewed · 12") shown in "My Tasks" when
 * that category's Settings-configured default assignee is you (or a team you're on) — see
 * mySummaries in useOpenItemsData. Not tied to any individual item, so there's no `assignment`. */
export type MySummaryEntry = { itemType: ItemType; title: string; count: number }
type MyPopoverState = { top: number; left: number; itemType: ItemType; itemId: string; initial: AssignResult }

/**
 * Renders one "assigned to me" row — used inline inside "Your To-Dos" (TodoPage.tsx and the
 * Dashboard widget) under the "My Tasks" tab, NOT as its own separate section (a standalone
 * "Assigned to You" panel next to "Your To-Dos" read as a duplicate "my stuff" list — this folds
 * into the one that already existed instead). Reassigning from here still uses the normal
 * AssignPopover, so a person can hand something off to someone else or a team without leaving
 * their own to-do list.
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
 * One category-level roll-up card ("Issues need to be reviewed · 12") — rendered in "My Tasks"
 * when Settings has a default assignee configured for that category and it matches the signed-in
 * user (or a team they're on). Unlike MyItemRow, this isn't a real, individually assignable item —
 * clicking it navigates to that category's own page (see todoSummaryRoute), where the actual
 * ready-for-review items are listed.
 */
export function MySummaryCard({ entry, onView }: { entry: MySummaryEntry; onView: (itemType: ItemType) => void }) {
  return (
    <div className="oi-row">
      <div className="oi-main">
        <button
          type="button"
          className="oi-title"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
          onClick={() => onView(entry.itemType)}
        >
          {entry.title}
        </button>
        <div className="oi-meta">
          <span className="tag norm">{entry.count.toLocaleString()} open</span>
        </div>
      </div>
    </div>
  )
}

export type OpenItemsDataInput = Pick<
  ShellContext,
  | 'checklistTodoEnabled'
  | 'issueTodoEnabled'
  | 'netaTrackerEnabled'
  | 'netaSubmissionsTodoEnabled'
  | 'netaReturnedTodoEnabled'
  | 'checklistDefaultAssignee'
  | 'issueDefaultAssignee'
  | 'netaSubmissionsDefaultAssignee'
  | 'netaReturnedDefaultAssignee'
  | 'teams'
  | 'currentUserEmail'
  | 'cxAlloyLinkBase'
>

/**
 * Everything the "Your To-Dos" widget (Dashboard + To-Do page) needs for Checklist/Issue/NETA
 * markers: individually-assigned "My Tasks" rows, and the default-assignee summary cards. Called
 * exactly once, in AppShell.tsx, and handed down via ShellContext (`ctx.openItems`) so the data
 * loads once at sign-in and is already warm by the time someone opens either page.
 *
 * There used to also be four big "Open Checklists/Issues/NETA ..." browsable list sections here —
 * removed 2026-09-24 by request (redundant with the Checklists/Issues/NETA Tracker pages
 * themselves): summary-card counts switched from "still open" to "ready for review"
 * (checklistReadyStatuses/issueReviewStatuses — the same definition the Checklists/Issues pages
 * use) to match, since a reviewer cares about what's ready for them, not everything outstanding
 * project-wide. NETA's counts are unchanged (no equivalent "ready" status exists there — still
 * open is still "not yet Submitted to Google" / "not yet Uploaded to ACC").
 */
export function useOpenItemsData(input: OpenItemsDataInput) {
  const {
    checklistTodoEnabled,
    issueTodoEnabled,
    netaTrackerEnabled,
    netaSubmissionsTodoEnabled,
    netaReturnedTodoEnabled,
    checklistDefaultAssignee,
    issueDefaultAssignee,
    netaSubmissionsDefaultAssignee,
    netaReturnedDefaultAssignee,
    teams,
    currentUserEmail,
    cxAlloyLinkBase,
  } = input

  // NETA Tracker's per-project on/off Settings toggle — even though the Submissions/Returned
  // toggles above are project-scoped too and shouldn't stay on after a switch, this is the same
  // defense-in-depth every other NETA consumer applies.
  const netaSubmissionsOn = netaSubmissionsTodoEnabled && netaTrackerEnabled
  const netaReturnedOn = netaReturnedTodoEnabled && netaTrackerEnabled

  // "Still open" fetches — power the individually-assigned "My Tasks" rows (myItems below). An
  // assignment made while the old Open-list UI existed is keyed by CxAlloy/NETA id regardless of
  // which list it came from, so these stay around to keep any existing assignment visible/
  // reassignable even though there's no more UI to create a brand new one.
  const checklistsFn = useGetOpenChecklists()
  const issuesFn = useGetOpenIssues()
  // "Ready for review" fetches — power the default-assignee summary cards' counts.
  const checklistsReadyFn = useGetChecklists()
  const issuesReviewFn = useGetIssues()
  const netaFn = useGetNetaTrackerData()
  const assignmentsFn = useGetItemAssignments()
  const saveFn = useSaveItemAssignments()

  useEffect(() => {
    if (checklistTodoEnabled) {
      void checklistsFn.trigger()
      void checklistsReadyFn.trigger()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistTodoEnabled])

  useEffect(() => {
    if (issueTodoEnabled) {
      void issuesFn.trigger()
      void issuesReviewFn.trigger()
    }
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

  // "Assigned to You" (rendered inside "Your To-Dos") is a personalized re-filter of the "still
  // open" lists — whether or not an item is currently ready for review, an existing assignment on
  // it stays visible to whoever it's assigned to.
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

  // Settings → per-category "default assignee": a single roll-up card per category, not per-item
  // assignment — shows only when that category's default is you (or a team you're on) AND there's
  // at least one item counted for it, so it disappears once that count hits zero instead of
  // lingering as a stale reminder. Checklist/Issue count "ready for review" (matches the
  // Checklists/Issues pages); NETA counts "still open" (no "ready" concept exists there).
  const isDefaultMine = (a: DefaultAssignee) => isTodoMine({ assignedEmail: a.email, assignedTeamId: a.teamId }, currentUserEmail, teams)
  const checklistReadyCount = checklistsReadyFn.data?.rows.length ?? 0
  const issueReviewCount = issuesReviewFn.data?.rows.length ?? 0
  const mySummaries: MySummaryEntry[] = currentUserEmail
    ? [
        ...(checklistTodoEnabled && checklistReadyCount > 0 && isDefaultMine(checklistDefaultAssignee)
          ? [{ itemType: 'checklist' as ItemType, title: 'Checklists need to be reviewed', count: checklistReadyCount }]
          : []),
        ...(issueTodoEnabled && issueReviewCount > 0 && isDefaultMine(issueDefaultAssignee)
          ? [{ itemType: 'issue' as ItemType, title: 'Issues need to be reviewed', count: issueReviewCount }]
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
    myItems,
    mySummaries,
    onAssign,
  }
}

export type OpenItemsData = ReturnType<typeof useOpenItemsData>
