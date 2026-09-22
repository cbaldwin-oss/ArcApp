/**
 * Which LaunchPad project (site) ArcApp is currently scoped to — STY4 (Phoenix DC3) or SANNT1B
 * (SAN-NT1B), both already-existing `launchpad_projects` rows with their own Sheet-backed tables
 * and Apps Script deployment. Read once at module load and treated as immutable for the page's
 * lifetime — switching projects (setCurrentProject) writes the choice to localStorage and reloads
 * the page, rather than trying to make every fetch/hook in the app reactive to a live project
 * change. That keeps this a plain constant every plain function in api.ts can read synchronously
 * (no React context, no stale-closure risk), at the cost of a page reload on switch — an
 * acceptable trade for an action taken rarely (picking which site you're working on), not per
 * click.
 */

export type ProjectKey = 'STY4' | 'SANNT1B'

export const PROJECTS: Array<{ key: ProjectKey; label: string }> = [
  { key: 'STY4', label: 'STY4 — Phoenix DC3' },
  { key: 'SANNT1B', label: 'SAN-NT1B' },
]

const STORAGE_KEY = 'arcapp_project'
const DEFAULT_PROJECT: ProjectKey = 'STY4'

function isProjectKey(v: unknown): v is ProjectKey {
  return v === 'STY4' || v === 'SANNT1B'
}

function readInitial(): ProjectKey {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (isProjectKey(v)) return v
  } catch {
    // localStorage unavailable (private browsing, etc.) — fall back to the default below.
  }
  return DEFAULT_PROJECT
}

export const CURRENT_PROJECT: ProjectKey = readInitial()

export function projectLabel(key: ProjectKey): string {
  return PROJECTS.find((p) => p.key === key)?.label ?? key
}

/**
 * Two independent capability gaps found while wiring up SAN-NT1B, both requiring manual setup on
 * the LaunchPad/Sheet side that this app can't do for you — pages depending on either show an
 * "unavailable for this project" notice instead of silently erroring or (worse) rendering broken
 * data:
 *
 *  - `siteLogging`: Tamper Seals and RTFT write to <prefix>Assets/<prefix>RTFT — those tables
 *    only exist for STY4 today.
 *  - `cxAlloyActions`: Checklists, Issues, Asset Attributes (+ its photo-crop OCR), and the
 *    Checklist/Issue To-Do sections all call custom actions (getChecklists/getIssues/
 *    getCxAlloySettings/getEquipmentAttributes/saveAttributes/saveImageOnly/ocrImage) that were
 *    added specifically to STY4's Apps Script deployment (see the "ADDED FOR ArcApp" block
 *    mentioned in api.ts) — SAN-NT1B's separately-deployed script doesn't have them yet, so an
 *    unrecognized `action` param there currently falls through to a different, equipment-tracker-
 *    shaped default response instead of an error, which would otherwise render as a page full of
 *    blank/malformed rows rather than fail cleanly.
 *  - `netaTracker`: mirrors the "STY4 NETA Tracker" Google Sheet (see NetaTrackerPanel.tsx) via
 *    its own dedicated Apps Script — that sheet, and its script, only exist for STY4 today.
 */
export type Capability = 'siteLogging' | 'cxAlloyActions' | 'netaTracker'

const CAPABILITIES: Record<ProjectKey, Record<Capability, boolean>> = {
  STY4: { siteLogging: true, cxAlloyActions: true, netaTracker: true },
  SANNT1B: { siteLogging: false, cxAlloyActions: false, netaTracker: false },
}

export function hasCapability(cap: Capability, project: ProjectKey = CURRENT_PROJECT): boolean {
  return CAPABILITIES[project][cap]
}

/** CxAlloy deep-link base per project — found while wiring up SAN-NT1B that this isn't just a
 * different project id on the same domain: STY4's checklists/issues live at google.cxalloy.com
 * (CxAlloy project 50506), SAN-NT1B's at tq.cxalloy.com (project 49639) — apparently different
 * CxAlloy tenant subdomains per client, not one shared instance. Used by cxAlloyChecklistUrl()/
 * cxAlloyIssueUrl() in api.ts to build a deep link for a bare checklist/issue id (rows that
 * already carry their own full link, like Equipment Tracker's `_Link` columns, don't need this). */
const CXALLOY_LINK_BASE: Record<ProjectKey, { domain: string; projectId: string }> = {
  STY4: { domain: 'google.cxalloy.com', projectId: '50506' },
  SANNT1B: { domain: 'tq.cxalloy.com', projectId: '49639' },
}
export function cxAlloyLinkBase(project: ProjectKey = CURRENT_PROJECT): { domain: string; projectId: string } {
  return CXALLOY_LINK_BASE[project]
}

export function setCurrentProject(key: ProjectKey) {
  if (key === CURRENT_PROJECT) return
  try {
    localStorage.setItem(STORAGE_KEY, key)
  } catch {
    // If this fails, the reload below still picks up the old project — better than a silent
    // no-op that leaves the picker showing a project that didn't actually switch anything.
  }
  window.location.href = '/'
}
