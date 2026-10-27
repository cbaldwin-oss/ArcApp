import { useEffect } from 'react'
import {
  useGetChecklists,
  useGetOpenChecklists,
  useGetIssues,
  useGetOpenIssues,
  useGetSubmittalsList,
  useGetNetaTrackerData,
  useGetMilestoneRecords,
  type ChecklistRow,
  type IssueRow,
  type Submittal,
  type NetaTrackerData,
  type MilestoneCriterion,
  type MilestoneRecord,
  type NetaFlag,
} from '../../lib/api'
import type { Milestone } from './types'

export type CriterionResult = { satisfied: number; total: number; pct: number | null }

export type ModuleData = {
  checklists: ChecklistRow[]
  issues: IssueRow[]
  submittals: Submittal[]
  neta: NetaTrackerData
}

const norm = (s: string) => s.trim().toLowerCase()

/**
 * Checklists/Issues/Submittals criteria all reduce to the same shape: how many of the rows
 * scoped to this criterion's assets already sit in one of its target statuses. `total` is 0 (and
 * `pct` null, excluded from the milestone's average) whenever no asset is picked yet, or none of
 * the picked assets currently have any rows in that module — a misconfigured/empty criterion
 * shouldn't silently count as either 0% or 100% done.
 */
export function evaluateCriterion(c: MilestoneCriterion, data: ModuleData): CriterionResult {
  switch (c.module) {
    case 'checklists':
    case 'issues': {
      const assetSet = new Set(c.assets.map(norm))
      const rows = c.module === 'checklists' ? data.checklists : data.issues
      const scoped = assetSet.size === 0 ? [] : rows.filter((r) => assetSet.has(norm(r.asset_name)))
      const satisfied = scoped.filter((r) => c.targetStatuses.includes(r.status)).length
      return { satisfied, total: scoped.length, pct: scoped.length === 0 ? null : (satisfied / scoped.length) * 100 }
    }
    case 'submittals': {
      const assetSet = new Set(c.assets.map(norm))
      const scoped = assetSet.size === 0 ? [] : data.submittals.filter((s) => s.assets.some((a) => assetSet.has(norm(a))))
      const satisfied = scoped.filter((s) => c.targetStatuses.includes(s.reviewStatus)).length
      return { satisfied, total: scoped.length, pct: scoped.length === 0 ? null : (satisfied / scoped.length) * 100 }
    }
    case 'neta': {
      const zoneSet = new Set(c.zones.map(norm))
      const rows = c.tab === 'Submissions' ? data.neta.submissions : data.neta.returnedFiles
      const scoped = zoneSet.size === 0 ? rows : rows.filter((r) => zoneSet.has(norm(r.zone)))
      const satisfied = scoped.filter((r) => {
        const v = (r as unknown as Record<string, unknown>)[c.flag]
        return v === true || v === 'N/A' // N/A means the check doesn't apply here, not that it's outstanding
      }).length
      return { satisfied, total: scoped.length, pct: scoped.length === 0 ? null : (satisfied / scoped.length) * 100 }
    }
  }
}

export type MilestoneProgress = {
  pct: number
  status: Milestone['status']
  label: string
  results: CriterionResult[]
  /** false for a milestone with zero criteria yet — distinct from a configured one that's just at 0%. */
  configured: boolean
}

/** Weighted-average-of-criteria-pct, each criterion weighted equally (not by item count) — picked
 * over all-or-nothing so a milestone resting on, say, 3 criteria shows real partial progress
 * instead of staying at 0% until the very last one clears. Criteria with no matching items (see
 * evaluateCriterion) are left out of the average rather than counted as 0 or 100. */
export function computeMilestoneProgress(criteria: MilestoneCriterion[], data: ModuleData): MilestoneProgress {
  if (criteria.length === 0) return { pct: 0, status: 'hold', label: 'NO CRITERIA', results: [], configured: false }
  const results = criteria.map((c) => evaluateCriterion(c, data))
  const valid = results.filter((r): r is CriterionResult & { pct: number } => r.pct !== null)
  const pct = valid.length === 0 ? 0 : Math.round(valid.reduce((sum, r) => sum + r.pct, 0) / valid.length)
  const status: Milestone['status'] = pct >= 100 ? 'complete' : pct >= 70 ? 'go' : pct >= 40 ? 'caution' : 'hold'
  const label = status === 'complete' ? 'COMPLETE' : status.toUpperCase()
  return { pct, status, label, results, configured: true }
}

export const NETA_FLAG_LABELS: Record<NetaFlag, string> = {
  clericalReview: 'Clerical Review complete',
  submittedToGoogle: 'Submitted to Google',
  technicalReview: 'Technical Review complete',
  stampPresent: 'Stamp Present',
  netaCompleted: 'NETA Completed',
  uploadedToAcc: 'Uploaded to ACC',
}
export const NETA_FLAGS_BY_TAB: Record<'Submissions' | 'Returned Files', NetaFlag[]> = {
  Submissions: ['clericalReview', 'submittedToGoogle'],
  'Returned Files': ['technicalReview', 'stampPresent', 'netaCompleted', 'uploadedToAcc'],
}

function assetPart(assets: string[]): string {
  return assets.length === 0 ? 'no assets picked yet' : assets.length === 1 ? assets[0] : `${assets.length} assets`
}
function zonePart(zones: string[]): string {
  return zones.length === 0 ? 'all zones' : zones.length === 1 ? zones[0] : `${zones.length} zones`
}
const MODULE_LABEL: Record<MilestoneCriterion['module'], string> = {
  checklists: 'Checklists',
  issues: 'Issues',
  submittals: 'Submittals',
  neta: 'NETA Tracker',
}

export function describeCriterion(c: MilestoneCriterion): string {
  if (c.module === 'neta') return `${MODULE_LABEL.neta} (${c.tab}) for ${zonePart(c.zones)} — ${NETA_FLAG_LABELS[c.flag]}`
  const statusPart = c.targetStatuses.length === 0 ? 'no target status picked yet' : c.targetStatuses.join(' or ')
  return `${MODULE_LABEL[c.module]} for ${assetPart(c.assets)} reach ${statusPart}`
}

export type ComputedMilestone = MilestoneRecord & { progress: MilestoneProgress }

/**
 * Fetches a milestone's criteria inputs — Checklists/Issues (ready + open, merged, so a criterion
 * can target any status regardless of which bucket it's normally filtered into elsewhere),
 * Submittals, and (when this project has it enabled) NETA Tracker data — and turns every milestone
 * into a live computed pct/status. `netaEnabled` gates the NETA fetch since getNetaTrackerData()
 * throws outright when the project hasn't configured it (see getNetaScriptUrl in api.ts).
 */
export function useMilestonesWithProgress(netaEnabled: boolean) {
  const milestonesFn = useGetMilestoneRecords()
  const checklistsFn = useGetChecklists()
  const openChecklistsFn = useGetOpenChecklists()
  const issuesFn = useGetIssues()
  const openIssuesFn = useGetOpenIssues()
  const submittalsFn = useGetSubmittalsList()
  const netaFn = useGetNetaTrackerData()

  function reload() {
    void milestonesFn.trigger()
    void checklistsFn.trigger()
    void openChecklistsFn.trigger()
    void issuesFn.trigger()
    void openIssuesFn.trigger()
    void submittalsFn.trigger()
    if (netaEnabled) void netaFn.trigger()
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netaEnabled])

  const data: ModuleData = {
    checklists: [...(checklistsFn.data?.rows ?? []), ...(openChecklistsFn.data?.rows ?? [])],
    issues: [...(issuesFn.data?.rows ?? []), ...(openIssuesFn.data?.rows ?? [])],
    submittals: submittalsFn.data ?? [],
    neta: netaFn.data ?? { submissions: [], returnedFiles: [], syncedAt: null },
  }

  const computed: ComputedMilestone[] = (milestonesFn.data ?? []).map((m) => ({ ...m, progress: computeMilestoneProgress(m.criteria, data) }))

  return {
    computed,
    data,
    loading: milestonesFn.loading && !milestonesFn.data,
    error: milestonesFn.error,
    reload,
  }
}
