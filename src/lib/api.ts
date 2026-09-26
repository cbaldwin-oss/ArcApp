/**
 * Direct replacement for the Retool-generated `hooks/backend/rno04.ts`.
 *
 * Every backend function that used to run inside Retool (with a trusted `req.user` and a
 * privileged DB connection) now runs as a plain Supabase client call from the browser, using the
 * signed-in user's own session. That means:
 *
 *   - Table access is governed entirely by Postgres Row Level Security (RLS). See
 *     supabase/policies.sql for the policies this app expects.
 *   - "Only the server can see req.user" is no longer true — anything sent as a parameter is
 *     client-controlled. Fields that used to be stamped server-side (e.g. `signoff` from
 *     `req.user.email`) are now stamped here from the current Supabase session, which is exactly
 *     as trustworthy as the RLS policy that checks it — no better. Don't rely on this file alone
 *     to keep people out of tables they shouldn't write to.
 *
 * Hook names and shapes are unchanged from the Retool version on purpose, so every component that
 * imports `useGetSchedule`, `useSaveWorkflows`, etc. keeps working with only an import-path change.
 */

import { useApiFn } from './useApiFn'
import { supabase } from './supabaseClient'
import { CURRENT_PROJECT, hasCapability } from './project'
import { FALLBACK_WORKFLOW_ITEMS, type WorkflowItem } from '../pages/arcapp/workflowItems'
import type { Team, TeamMember, Todo, TaskTag } from '../pages/arcapp/types'

// The active LaunchPad project (site) — see src/lib/project.ts. Every table-name template below
// (STY4dropdownoptions, STY4BackEndData, STY4authorized_editors, etc.) reads this instead of a
// hardcoded 'STY4' literal now, so the whole file follows whichever project is currently
// selected. Declared here (not near its original single use above cxAlloyChecklistUrl/
// cxAlloyIssueUrl) since the dropdown-options functions below need it too.
const CXALLOY_TABLE_PREFIX: string = CURRENT_PROJECT

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

function stripHtml(str: unknown): string {
  return (str || '').toString().replace(/<[^>]+>/g, '').trim()
}

async function getCurrentUserEmail(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  return data.user?.email ?? ''
}

function distinctTrimmed(rows: Array<Record<string, unknown>>, column: string): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    const v = (r[column] ?? '').toString().trim()
    if (v) set.add(v)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

// checkEditor (mirrored backend/rno04/checkEditor.ts, checked email against
// `${CXALLOY_TABLE_PREFIX}authorized_editors` — LaunchPad's shared edit-rights table) was removed
// 2026-09-24: canEdit/isAdmin now come entirely from arcapp_authorized_users (see
// src/lib/useCurrentUser.ts and AppShell.tsx), ArcApp's own table, by explicit request to keep
// ArcApp's permission model independent of LaunchPad's.

// ---------------------------------------------------------------------------
// dropdown options — mirrors getActivityOptions / getAssetOptions / getResultOptions
// ---------------------------------------------------------------------------

async function getActivityOptions(): Promise<string[]> {
  const res = await supabase.from(`${CXALLOY_TABLE_PREFIX}dropdownoptions`).select('Activities').not('Activities', 'is', null)
  return distinctTrimmed(unwrap(res) as Array<Record<string, unknown>>, 'Activities')
}
export function useGetActivityOptions() {
  return useApiFn(getActivityOptions)
}

async function getAssetOptions(): Promise<string[]> {
  const res = await supabase.from(`${CXALLOY_TABLE_PREFIX}dropdownoptions`).select('Assets').not('Assets', 'is', null)
  return distinctTrimmed(unwrap(res) as Array<Record<string, unknown>>, 'Assets')
}
export function useGetAssetOptions() {
  return useApiFn(getAssetOptions)
}

// Each STY4dropdownoptions row is a correlated tuple (Places, Times, Activities, Assets,
// Trade_Partners, Results, Zone) — unlike the flat single-column pulls above, this keeps the
// Asset->Place pairing so picking an asset can auto-fill its place instead of asking for both.
async function getAssetPlaceOptions(): Promise<Array<{ asset: string; place: string }>> {
  const res = await supabase.from(`${CXALLOY_TABLE_PREFIX}dropdownoptions`).select('Assets, Places').not('Assets', 'is', null)
  const rows = unwrap(res) as Array<{ Assets: string | null; Places: string | null }>
  const seen = new Set<string>()
  const out: Array<{ asset: string; place: string }> = []
  for (const r of rows) {
    const asset = (r.Assets ?? '').trim()
    if (!asset || seen.has(asset)) continue
    seen.add(asset)
    out.push({ asset, place: (r.Places ?? '').trim() })
  }
  return out.sort((a, b) => a.asset.localeCompare(b.asset))
}
export function useGetAssetPlaceOptions() {
  return useApiFn(getAssetPlaceOptions)
}

async function getResultOptions(): Promise<string[]> {
  const res = await supabase.from(`${CXALLOY_TABLE_PREFIX}dropdownoptions`).select('Results').not('Results', 'is', null)
  return distinctTrimmed(unwrap(res) as Array<Record<string, unknown>>, 'Results')
}
export function useGetResultOptions() {
  return useApiFn(getResultOptions)
}

// ---------------------------------------------------------------------------
// checklists / issues — read from the "STY4A API Database" Google Sheet (tabs: Checklists,
// Issues, CxAlloy Settings), via that project's Apps Script web app. The script URL isn't
// hardcoded here — it's looked up from `launchpad_projects` (already anon-readable; shared with
// LaunchPad), keyed by table_prefix, so this keeps working if the deployment URL ever changes.
//
// The Apps Script itself only exposes read-only actions added specifically for this
// (getChecklists / getIssues / getCxAlloySettings) — see the "ADDED FOR ArcApp" block in that
// script. Status filtering happens server-side (query params) since Checklists/Issues each run
// 15-20k+ rows and callers only ever want a handful of statuses.
// ---------------------------------------------------------------------------

/** google.cxalloy.com/70 for STY4, tq.cxalloy.com/49639 for SAN-NT1B — a real per-tenant
 * difference (found while wiring up SAN-NT1B), not just a project id on one shared domain. Used
 * to build a deep link for a bare checklist/issue id (rows that already carry their own full
 * link, like Equipment Tracker's `_Link` columns, don't need this). This used to be a hardcoded
 * per-project map in src/lib/project.ts — meant a code change for every new site, and the STY4
 * entry (50506) turned out to be wrong anyway (the real value, confirmed against ~12k live
 * Equipment Tracker links, is 70). See getCxAlloyLinkBase below for where it comes from now. */
export type CxAlloyLinkBase = { domain: string; projectId: string }

export function cxAlloyChecklistUrl(checklistId: string, base: CxAlloyLinkBase | null): string {
  if (!base) return ''
  return `https://${base.domain}/project/${base.projectId}/checklists/${encodeURIComponent(checklistId)}`
}
export function cxAlloyIssueUrl(issueId: string, base: CxAlloyLinkBase | null): string {
  if (!base) return ''
  return `https://${base.domain}/project/${base.projectId}/constructionissue/${encodeURIComponent(issueId)}#sort%5B%5D=identified-d`
}

const CXALLOY_LINK_RE = /^https?:\/\/([^/]+)\/project\/(\d+)\//

/** Parses a manual override from Settings ("google.cxalloy.com/70") — same shape either field
 * of a `_Link` URL would give, just typed by hand instead of pulled from one. */
export function parseCxAlloyLinkBase(v: string): CxAlloyLinkBase | null {
  const trimmed = v.trim()
  if (!trimmed) return null
  const m = /^([^/\s]+)\/(\d+)$/.exec(trimmed)
  return m ? { domain: m[1], projectId: m[2] } : null
}

/**
 * Auto-detects the CxAlloy domain+project id from this project's own Equipment Tracker data
 * instead of a hardcoded map — every `_Link` field the sheet sync already produces
 * (`Asset_Link`, `<checklist>_Link`, `<issue>_Link`, ...) points at the same domain+project id, so
 * the first one found in the first few rows is enough. Only pulls `data->0`/`->1`/`->2` (a few KB)
 * via PostgREST's jsonb path selection, not the whole `launchpad_equipment_tracker_data.data`
 * column — that's the same payload the Equipment Tracker page itself loads, and for STY4 today
 * that's ~1.6MB; fetching all of it a second time just to read two short strings would be wasteful
 * on every page load. Returns null (not an error) if this project's Equipment Tracker has no data
 * yet, or no row happens to carry a `_Link` field within the first few rows checked — a Settings
 * override (see AppShell.tsx's effective cxAlloyLinkBase) covers that case.
 */
async function getCxAlloyLinkBase(): Promise<CxAlloyLinkBase | null> {
  const res = await supabase
    .from('launchpad_equipment_tracker_data')
    .select('r0:data->0,r1:data->1,r2:data->2')
    .eq('project_key', CXALLOY_TABLE_PREFIX)
    .maybeSingle()
  if (res.error) throw new Error(res.error.message)
  const row = res.data as Record<string, Record<string, unknown> | null> | null
  if (!row) return null
  for (const sample of [row.r0, row.r1, row.r2]) {
    if (!sample) continue
    for (const [key, value] of Object.entries(sample)) {
      if (!key.endsWith('_Link') || typeof value !== 'string') continue
      const m = CXALLOY_LINK_RE.exec(value)
      if (m) return { domain: m[1], projectId: m[2] }
    }
  }
  return null
}
export function useGetCxAlloyLinkBase() {
  return useApiFn(getCxAlloyLinkBase)
}

/** Pure resolver for the project's shared LaunchPad Apps Script URL — no capability/feature check
 * baked in, since it's used by two independently-gated feature families (fetchCxAlloySheet's own
 * `cxAlloyActions` check below, and getAssetAttributesScriptUrl's `assetAttributesEnabled` check)
 * that shouldn't be coupled to each other's on/off state. */
async function getCxAlloyScriptUrl(): Promise<string> {
  const res = await supabase
    .from('launchpad_projects')
    .select('google_script_url')
    .eq('table_prefix', CXALLOY_TABLE_PREFIX)
    .maybeSingle()
  if (res.error) throw new Error(res.error.message)
  const url = (res.data as { google_script_url: string | null } | null)?.google_script_url
  if (!url) throw new Error(`No google_script_url configured for project "${CXALLOY_TABLE_PREFIX}" in launchpad_projects.`)
  return url
}

async function fetchCxAlloySheet(action: string, params: Record<string, string> = {}): Promise<Array<Record<string, string>>> {
  // Guards Checklists/Issues/CxAlloy Settings/People against a project whose Apps Script hasn't
  // had the ArcApp-specific actions added yet — Asset Attributes is gated separately
  // (getAssetAttributesScriptUrl below), since its actions are pre-existing LaunchPad ones, not an
  // ArcApp addition to this same script.
  if (!hasCapability('cxAlloyActions')) {
    throw new Error(`This project's Apps Script doesn't have the ArcApp actions (getChecklists/getIssues/etc.) added yet.`)
  }
  const scriptUrl = await getCxAlloyScriptUrl()
  const url = new URL(scriptUrl)
  url.searchParams.set('action', action)
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`CxAlloy data request failed (HTTP ${res.status})`)
  const json = (await res.json()) as { status?: string; error?: string; data?: Array<Record<string, string>> }
  if (json.status === 'error') throw new Error(json.error || 'CxAlloy data request failed')
  return json.data ?? []
}

// ---- CxAlloy Settings tab — the selectable status/type/priority vocabulary ----

export type CxAlloySettingsData = {
  checklistStatuses: string[]
  checklistTypes: string[]
  issueStatuses: string[]
  issuePriorities: string[]
}
function distinctColumn(rows: Array<Record<string, string>>, column: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of rows) {
    const v = (r[column] ?? '').toString().trim()
    if (v && !seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}
async function getCxAlloySettingsSheet(): Promise<CxAlloySettingsData> {
  const rows = await fetchCxAlloySheet('getCxAlloySettings')
  return {
    checklistStatuses: distinctColumn(rows, 'Checklist Status Name'),
    checklistTypes: distinctColumn(rows, 'Checklist Type Name'),
    issueStatuses: distinctColumn(rows, 'Issue Status Name'),
    issuePriorities: distinctColumn(rows, 'Issue Priority Name'),
  }
}
export function useGetCxAlloySettingsSheet() {
  return useApiFn(getCxAlloySettingsSheet)
}

// ---- People — Name/Company lookup, used to filter Issues down to CriticalArc-created ones ----

export type PersonRow = { name: string; company: string }
/** Header lookup is case-insensitive (unlike distinctColumn's exact-match "Checklist Status Name"
 * style above) since this is a brand-new tab someone exports by hand — "Name"/"name" and
 * "Company"/"company" both work rather than silently returning nothing over a casing mismatch. */
function findCaseInsensitive(row: Record<string, string>, key: string): string {
  const match = Object.keys(row).find((k) => k.toLowerCase() === key)
  return match ? (row[match] ?? '').toString().trim() : ''
}
function mapPeopleRows(raw: Array<Record<string, string>>): PersonRow[] {
  return raw.map((r) => ({ name: findCaseInsensitive(r, 'name'), company: findCaseInsensitive(r, 'company') }))
}
/** Reads the "People" tab (Name/Company columns) — added for the Issues creator-company filter
 * below. Requires the `getPeople` Apps Script action (see AppendPeopleAction.gs); on a project
 * whose script doesn't have it yet, this comes back empty rather than erroring (same fallback
 * fetchCxAlloySheet already has for any unrecognized action), which is why
 * issueCreatorCompanyFilter defaults to off — turning it on before the action exists would filter
 * every issue out instead of showing an error. */
async function getPeople(): Promise<PersonRow[]> {
  const raw = await fetchCxAlloySheet('getPeople')
  return mapPeopleRows(raw)
}
export function useGetPeople() {
  return useApiFn(getPeople)
}

// ---- Checklists ----

export type ChecklistRow = {
  checklist_id: string
  number: string
  name: string
  asset_name: string
  type_name: string
  status: string
  discipline: string
  assigned_name: string
  date_created: string
}
function mapChecklistRows(raw: Array<Record<string, string>>): ChecklistRow[] {
  return raw.map((r) => ({
    checklist_id: (r.checklist_id ?? '').toString(),
    number: (r.number ?? '').toString(),
    name: (r.name ?? '').toString(),
    asset_name: (r.asset_name ?? '').toString(),
    type_name: (r.type_name ?? '').toString(),
    status: (r.status ?? '').toString(),
    discipline: (r.discipline ?? '').toString(),
    assigned_name: (r.assigned_name ?? '').toString(),
    date_created: (r.date_created ?? '').toString(),
  }))
}
async function getChecklists(): Promise<{ rows: ChecklistRow[]; readyStatuses: string[] }> {
  const { checklistReadyStatuses: readyStatuses } = await getSettings()
  const raw = await fetchCxAlloySheet('getChecklists', { status: readyStatuses.join(',') })
  return { rows: mapChecklistRows(raw), readyStatuses }
}
export function useGetChecklists() {
  return useApiFn(getChecklists)
}

// Same sheet/action, filtered by "still open" — everything in the live CxAlloy status vocabulary
// that ISN'T in checklistReadyStatuses (Settings → Checklist Ready). Ready and open are opposite
// ends of the same status list by construction, so there's no separate "open" list to configure —
// picking Ready statuses in Settings is enough to define both. Returns nothing (no request at all)
// if that leaves zero open statuses (e.g. every known status is marked Ready), since the Apps
// Script needs an explicit status filter — see fetchCxAlloySheet's header comment on why
// Checklists/Issues never fetch unfiltered (15-20k+ rows each).
async function getOpenChecklists(): Promise<{ rows: ChecklistRow[]; openStatuses: string[] }> {
  const [{ checklistReadyStatuses: readyStatuses }, { checklistStatuses: allStatuses }] = await Promise.all([getSettings(), getCxAlloySettingsSheet()])
  const openStatuses = allStatuses.filter((s) => !readyStatuses.includes(s))
  if (!openStatuses.length) return { rows: [], openStatuses }
  const raw = await fetchCxAlloySheet('getChecklists', { status: openStatuses.join(',') })
  return { rows: mapChecklistRows(raw), openStatuses }
}
export function useGetOpenChecklists() {
  return useApiFn(getOpenChecklists)
}

// ---- Issues ----

export type IssueRow = {
  issue_id: string
  name: string
  description: string
  asset_name: string
  priority: string
  status: string
  created_by: string
  assigned_name: string
  source_type: string
  due_date: string
  date_created: string
}
function mapIssueRows(raw: Array<Record<string, string>>): IssueRow[] {
  return raw.map((r) => ({
    issue_id: (r.issue_id ?? '').toString(),
    name: (r.name ?? '').toString(),
    description: (r.description ?? '').toString(),
    asset_name: (r.asset_name ?? '').toString(),
    priority: (r.priority ?? '').toString(),
    status: (r.status ?? '').toString(),
    created_by: (r.created_by ?? '').toString(),
    assigned_name: (r.assigned_name ?? '').toString(),
    source_type: (r.source_type ?? '').toString(),
    due_date: (r.due_date ?? '').toString(),
    date_created: (r.date_created ?? '').toString(),
  }))
}
/** Settings → "Issues — creator company filter" (blank = off, shows every issue regardless of
 * creator). When set, keeps only issues whose Created By is either that exact company name (an
 * issue created by a shared/org account rather than a person) or a person listed in the People
 * tab (see getPeople above) under that company — applied to both getIssues and getOpenIssues so
 * the main Issues page and every To-Do view of issues agree on what counts. */
async function filterByCreatorCompany(rows: IssueRow[]): Promise<IssueRow[]> {
  const { issueCreatorCompanyFilter } = await getSettings()
  const filter = issueCreatorCompanyFilter.trim().toLowerCase()
  if (!filter) return rows
  const people = await getPeople()
  const companyNames = new Set(people.filter((p) => p.company.toLowerCase() === filter).map((p) => p.name.toLowerCase()))
  return rows.filter((r) => {
    const createdBy = r.created_by.trim().toLowerCase()
    return createdBy === filter || companyNames.has(createdBy)
  })
}

async function getIssues(): Promise<{ rows: IssueRow[]; reviewStatuses: string[] }> {
  const { issueReviewStatuses: reviewStatuses } = await getSettings()
  const raw = await fetchCxAlloySheet('getIssues', { status: reviewStatuses.join(',') })
  const rows = await filterByCreatorCompany(mapIssueRows(raw))
  return { rows, reviewStatuses }
}
export function useGetIssues() {
  return useApiFn(getIssues)
}

// Same idea as getOpenChecklists above — "still open" is everything NOT in issueReviewStatuses
// (Settings → Issues for Review), not a separately configured list.
async function getOpenIssues(): Promise<{ rows: IssueRow[]; openStatuses: string[] }> {
  const [{ issueReviewStatuses: reviewStatuses }, { issueStatuses: allStatuses }] = await Promise.all([getSettings(), getCxAlloySettingsSheet()])
  const openStatuses = allStatuses.filter((s) => !reviewStatuses.includes(s))
  if (!openStatuses.length) return { rows: [], openStatuses }
  const raw = await fetchCxAlloySheet('getIssues', { status: openStatuses.join(',') })
  const rows = await filterByCreatorCompany(mapIssueRows(raw))
  return { rows, openStatuses }
}
export function useGetOpenIssues() {
  return useApiFn(getOpenIssues)
}

// ---------------------------------------------------------------------------
// Checklist/Issue To-Do — who's responsible for chasing down a specific open checklist/issue.
// Checklists/Issues themselves are read-only Sheet data (see above), so this is ArcApp's own
// table, keyed by the CxAlloy id, following arcapp_tasks' "at most one of team or person,
// enforced app-side" assignment convention (todoAssignmentLabel() in utils.ts works on this
// shape unchanged since the field names match Todo's).
// ---------------------------------------------------------------------------

export type ItemType = 'checklist' | 'issue' | 'neta_submission' | 'neta_returned'
export type ItemAssignment = {
  itemType: ItemType
  itemId: string
  assignedTeamId: string | null
  assignedEmail: string | null
  assignedName: string | null
}

async function getItemAssignments(): Promise<ItemAssignment[]> {
  const res = await supabase
    .from('arcapp_item_assignments')
    .select('item_type, item_id, assigned_team_id, assigned_email, assigned_name')
    .eq('project_key', CURRENT_PROJECT)
  const rows = unwrap(res) as Array<{
    item_type: string
    item_id: string
    assigned_team_id: string | null
    assigned_email: string | null
    assigned_name: string | null
  }>
  return rows.map((r) => ({
    itemType: r.item_type as ItemType,
    itemId: r.item_id,
    assignedTeamId: r.assigned_team_id,
    assignedEmail: r.assigned_email,
    assignedName: r.assigned_name,
  }))
}
export function useGetItemAssignments() {
  return useApiFn(getItemAssignments)
}

// Bulk-capable by design — the same target (team, or person) gets applied to every item in
// `items` in one round trip, which is what both the per-row "reassign" control and the
// multi-select toolbar's "Assign selected" button call, just with a 1- or N-item list.
async function saveItemAssignments(params: {
  items: Array<{ itemType: ItemType; itemId: string }>
  assignedTeamId: string | null
  assignedEmail: string | null
  assignedName: string | null
}): Promise<{ count: number }> {
  if (!params.items.length) return { count: 0 }
  const updatedBy = (await getCurrentUserEmail()) || 'admin'
  const records = params.items.map((item) => ({
    project_key: CURRENT_PROJECT,
    item_type: item.itemType,
    item_id: item.itemId,
    assigned_team_id: params.assignedTeamId,
    assigned_email: params.assignedEmail,
    assigned_name: params.assignedName,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  }))
  const res = await supabase.from('arcapp_item_assignments').upsert(records, { onConflict: 'project_key,item_type,item_id' })
  if (res.error) throw new Error(res.error.message)
  return { count: records.length }
}
export function useSaveItemAssignments() {
  return useApiFn(saveItemAssignments)
}

// ---------------------------------------------------------------------------
// Asset Attributes — nameplate/spec data per asset (Manufacturer, Model, Serial, voltage, etc.),
// grouped by category via a "Group: Attribute Name" key convention (ungrouped keys fall under
// "General"). This is LaunchPad's own long-running feature, not something new added for
// ArcApp — `getCxAlloyScriptUrl()` isn't actually CxAlloy-specific, it's just "the STY4 project's
// shared Apps Script" (stored in launchpad_projects, shared with LaunchPad), and
// getEquipmentAttributes/saveAttributes already exist there because LaunchPad's Asset Attributes
// page already calls them — this just gives ArcApp its own window into the same data. QR/photo-OCR
// scanning (LaunchPad has both) is intentionally not ported here — deferred to a follow-up.
//
// Gated by its own per-project Settings toggle, `assetAttributesEnabled` (added 2026-09-25) —
// deliberately NOT tied to the `cxAlloyActions` capability Checklists/Issues use, since these
// actions are pre-existing LaunchPad ones (not an ArcApp addition to the script) and can genuinely
// work on a project even where Checklists/Issues can't yet, or vice versa.
// ---------------------------------------------------------------------------

async function getAssetAttributesScriptUrl(): Promise<string> {
  const { assetAttributesEnabled } = await getSettings()
  if (!assetAttributesEnabled) throw new Error('Asset Attributes isn’t enabled for this project.')
  return getCxAlloyScriptUrl()
}

export type AssetAttributeRow = Record<string, string>

async function getEquipmentAttributes(): Promise<AssetAttributeRow[]> {
  const scriptUrl = await getAssetAttributesScriptUrl()
  const url = new URL(scriptUrl)
  url.searchParams.set('action', 'getEquipmentAttributes')
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Asset Attributes request failed (HTTP ${res.status})`)
  const json = (await res.json()) as { status?: string; error?: string; data?: Array<Record<string, unknown>> }
  if (json.error || json.status === 'error') throw new Error(json.error || 'Asset Attributes request failed')
  return (json.data ?? []).map((row) => {
    const out: AssetAttributeRow = {}
    for (const [k, v] of Object.entries(row)) out[k] = v == null ? '' : String(v)
    return out
  })
}
export function useGetEquipmentAttributes() {
  return useApiFn(getEquipmentAttributes)
}

export type AttributeChange = { attribute: string; newValue: string }
async function saveAssetAttributes(params: { assetName: string; changes: AttributeChange[] }): Promise<{ success: boolean }> {
  if (!params.changes.length) return { success: true }
  const scriptUrl = await getAssetAttributesScriptUrl()
  const res = await fetch(scriptUrl, {
    method: 'POST',
    // text/plain avoids a CORS preflight, same reasoning as Joint Pack Photos' upload — Apps
    // Script web apps don't answer OPTIONS requests.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'saveAttributes', assetName: params.assetName, changes: params.changes }),
  })
  if (!res.ok) throw new Error(`Save failed (HTTP ${res.status})`)
  const json = (await res.json()) as { success?: boolean; error?: string; debug?: string[] }
  if (json.debug?.length) {
    const hasError = json.debug.some((l) => l.includes('❌') || l.toUpperCase().includes('ERROR'))
    if (hasError) throw new Error(json.debug.join('\n'))
  }
  if (!json.success) throw new Error(json.error || 'Save failed.')
  return { success: true }
}
export function useSaveAssetAttributes() {
  return useApiFn(saveAssetAttributes)
}

// Multi-box photo-crop OCR — draw boxes on a nameplate photo, each box gets OCR'd separately and
// mapped to one attribute. Exported as plain functions (not useApiFn hooks) because the caller
// fires several of these concurrently via Promise.all and needs its own combined status/progress
// state, not one hook's single loading/error pair.
export async function uploadAssetPhoto(params: { assetName: string; scanType: string; imageBase64: string }): Promise<{ fileName: string }> {
  const scriptUrl = await getAssetAttributesScriptUrl()
  const res = await fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'saveImageOnly', image: params.imageBase64, assetName: params.assetName, scanType: params.scanType }),
  })
  if (!res.ok) throw new Error(`Photo upload failed (HTTP ${res.status})`)
  const json = (await res.json()) as { success?: boolean; fileName?: string; error?: string }
  if (!json.success) throw new Error(json.error || 'Photo upload failed.')
  return { fileName: json.fileName || '' }
}

export async function ocrAssetImage(params: {
  assetName: string
  attributeName: string
  photoName: string
  imageBase64: string
}): Promise<{ text: string }> {
  const scriptUrl = await getAssetAttributesScriptUrl()
  const res = await fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'ocrImage',
      image: params.imageBase64,
      assetName: params.assetName,
      attributeName: params.attributeName,
      photoName: params.photoName,
    }),
  })
  if (!res.ok) throw new Error(`OCR request failed (HTTP ${res.status})`)
  const json = (await res.json()) as { success?: boolean; text?: string; error?: string }
  // A failed/empty OCR read isn't fatal to the batch — same as the reference, a box that comes
  // back empty just doesn't fill in its attribute, the others still apply.
  if (!json.success || !json.text) return { text: '' }
  return { text: json.text.replace(/\n+/g, ' ').replace(/[|[\]{}]/g, '').trim() }
}

// ---------------------------------------------------------------------------
// Equipment Status Tracker — read-only view of LaunchPad's own L2/L3/L4 phase-tracking grid.
// Unlike everything above, this doesn't go through Apps Script at all: LaunchPad periodically
// syncs the underlying Google Sheet into `launchpad_equipment_tracker_data` (a GitHub Action, not
// this app) and keeps its own editable config in `launchpad_equipment_tracker_config` — both
// already anon-readable, shared with LaunchPad, keyed by project_key (same value as
// CXALLOY_TABLE_PREFIX for this deployment). ArcApp only reads them; the Settings/config editor,
// Phase Rules Engine, and status-color admin UI stay LaunchPad's to own and are not ported here.
// ---------------------------------------------------------------------------

export type EquipmentTrackerRow = Record<string, string>

export type EqPhaseRule = {
  active?: string
  phase?: string
  prevStatus?: string
  maxGate?: string
  maxSupport?: string
  maxSupportPendingCx?: string
  maxGatingIssues?: string
  maxNonGatingIssues?: string
  resultingStatus?: string
  includeOpenCHKs?: string
  includeOpenGatingIssues?: string
  color?: string
}

export type EqStatusColor = { name: string; color: string }

export type EqCustomHeaders = {
  areaPrefix: string
  l2Phase: string
  l2Gate: string
  l2Status: string
  l3Phase: string
  l3Gate: string
  l3Status: string
  l4Phase: string
  l4Gate: string
  l4Status: string
  issPhase: string
  issStatus: string
}

export type EquipmentTrackerConfig = {
  showL2Gate: boolean
  showL3Gate: boolean
  showL4Gate: boolean
  showL2Supp: boolean
  showL3Supp: boolean
  showL4Supp: boolean
  openStatuses: EqStatusColor[]
  closedStatuses: EqStatusColor[]
  cxCompleteStatuses: EqStatusColor[]
  testOpenStatuses: EqStatusColor[]
  testClosedStatuses: EqStatusColor[]
  issueOpenStatuses: EqStatusColor[]
  issueClosedStatuses: EqStatusColor[]
  gatingIssues: EqStatusColor[]
  nonGatingIssues: EqStatusColor[]
  fallbackColor: string
  customHeaders: EqCustomHeaders
}

export type EquipmentTrackerData = {
  rows: EquipmentTrackerRow[]
  phaseRules: EqPhaseRule[]
  syncedAt: string | null
  config: EquipmentTrackerConfig
}

const EQ_TRACKER_DEFAULT_CONFIG: EquipmentTrackerConfig = {
  showL2Gate: true,
  showL3Gate: true,
  showL4Gate: true,
  showL2Supp: true,
  showL3Supp: true,
  showL4Supp: true,
  openStatuses: [],
  closedStatuses: [],
  cxCompleteStatuses: [],
  testOpenStatuses: [],
  testClosedStatuses: [],
  issueOpenStatuses: [],
  issueClosedStatuses: [],
  gatingIssues: [],
  nonGatingIssues: [],
  fallbackColor: '#f5f5f5',
  customHeaders: {
    areaPrefix: 'Area',
    l2Phase: 'L2 Verification',
    l2Gate: 'Gate CL',
    l2Status: 'Status',
    l3Phase: 'L3 Functional',
    l3Gate: 'Gate CL',
    l3Status: 'Status',
    l4Phase: 'L4 Integrated',
    l4Gate: 'Gate CL',
    l4Status: 'Status',
    issPhase: 'Asset Issues',
    issStatus: 'Open Issues',
  },
}

async function getEquipmentTrackerData(): Promise<EquipmentTrackerData> {
  const [dataRes, configRes] = await Promise.all([
    supabase
      .from('launchpad_equipment_tracker_data')
      .select('data, phase_rules, synced_at')
      .eq('project_key', CXALLOY_TABLE_PREFIX)
      .maybeSingle(),
    supabase.from('launchpad_equipment_tracker_config').select('config').eq('project_key', CXALLOY_TABLE_PREFIX).maybeSingle(),
  ])
  if (dataRes.error) throw new Error(dataRes.error.message)
  if (configRes.error) throw new Error(configRes.error.message)

  const row = dataRes.data as { data: EquipmentTrackerRow[] | null; phase_rules: EqPhaseRule[] | null; synced_at: string | null } | null
  const savedConfig = ((configRes.data as { config: Partial<EquipmentTrackerConfig> | null } | null)?.config ?? {}) as Partial<EquipmentTrackerConfig>

  return {
    rows: row?.data ?? [],
    phaseRules: row?.phase_rules ?? [],
    syncedAt: row?.synced_at ?? null,
    config: {
      ...EQ_TRACKER_DEFAULT_CONFIG,
      ...savedConfig,
      customHeaders: { ...EQ_TRACKER_DEFAULT_CONFIG.customHeaders, ...(savedConfig.customHeaders ?? {}) },
    },
  }
}
export function useGetEquipmentTrackerData() {
  return useApiFn(getEquipmentTrackerData)
}

// ---------------------------------------------------------------------------
// Joint Pack Photos — read from the "Joint Pack Photo - STY4A" Google Sheet (tabs: "Joint Packs",
// "Settings") via its own Apps Script web app — a separate spreadsheet from CxAlloy's, so it has
// its own script and its own URL, stored in arcapp_settings (not launchpad_projects — that row's
// google_script_url is CxAlloy's and shared with LaunchPad; this one is ArcApp-only). Photos
// themselves upload straight to Drive from that same script (DriveApp, running as the script's
// owner) into whatever folder ID is set on the Settings page, so no separate Drive connection is
// needed — see JointPackPhotoScript.gs (given to the user to deploy; not committed to this repo,
// same as CxAlloy's script isn't) for the doGet/doPost implementation.
// ---------------------------------------------------------------------------

async function getJointPackScriptUrl(): Promise<string> {
  const { jointPackEnabled, jointPackScriptUrl } = await getSettings()
  if (!jointPackEnabled) throw new Error('Joint Pack Photos isn’t enabled for this project.')
  if (!jointPackScriptUrl) throw new Error('Joint Pack Photo logging isn\'t wired up yet — set the Apps Script URL in Settings.')
  return jointPackScriptUrl
}

async function fetchJointPackScript(action: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const scriptUrl = await getJointPackScriptUrl()
  const url = new URL(scriptUrl)
  url.searchParams.set('action', action)
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Joint Pack data request failed (HTTP ${res.status})`)
  const json = (await res.json()) as { status?: string; error?: string } & Record<string, unknown>
  if (json.status === 'error') throw new Error(json.error || 'Joint Pack data request failed')
  return json
}

export type JointPackRow = {
  row: number
  building: string
  asset: string
  jointPackNumber: string
  topUrl: string
  sideUrl: string
  bottomUrl: string
}
export type JointPackData = {
  rows: JointPackRow[]
  /** The full "Joint Pack Assets" list from the sheet's Settings tab — assets that need tracking,
   * whether or not they have any Joint Pack # rows yet. */
  knownAssets: string[]
}
async function getJointPackData(): Promise<JointPackData> {
  const json = await fetchJointPackScript('getJointPackData')
  const rawRows = (json.rows as Array<Record<string, unknown>>) ?? []
  const rows: JointPackRow[] = rawRows.map((r) => ({
    row: Number(r.row) || 0,
    building: String(r.building ?? ''),
    asset: String(r.asset ?? ''),
    jointPackNumber: String(r.jointPackNumber ?? ''),
    topUrl: String(r.topUrl ?? ''),
    sideUrl: String(r.sideUrl ?? ''),
    bottomUrl: String(r.bottomUrl ?? ''),
  }))
  const knownAssets = ((json.assets as string[] | undefined) ?? []).map((a) => String(a)).filter(Boolean)
  return { rows, knownAssets }
}
export function useGetJointPackData() {
  return useApiFn(getJointPackData)
}

export type JointPackSide = 'Top' | 'Side' | 'Bottom'
export type LogJointPackPhotosParams = {
  building: string
  asset: string
  jointPackNumber: string
  /** dataUrl = a `data:image/jpeg;base64,...` string (see compressImageFile in utils.ts). */
  photos: Array<{ side: JointPackSide; dataUrl: string }>
}
async function logJointPackPhotos(params: LogJointPackPhotosParams): Promise<{ results: Array<{ side: string; url: string }> }> {
  const { jointPackPhotosFolder: folderId } = await getSettings()
  if (!folderId.trim()) throw new Error('Set a Google Drive destination folder in Settings before logging Joint Pack photos.')
  const scriptUrl = await getJointPackScriptUrl()
  const res = await fetch(scriptUrl, {
    method: 'POST',
    // text/plain avoids a CORS preflight (Apps Script web apps don't answer OPTIONS) — the script
    // still JSON.parses e.postData.contents regardless of the declared content type.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'logPhotos',
      building: params.building,
      asset: params.asset,
      jointPackNumber: params.jointPackNumber,
      folderId: folderId.trim(),
      photos: params.photos.map((p) => ({ side: p.side, base64: p.dataUrl })),
    }),
  })
  if (!res.ok) throw new Error(`Photo upload failed (HTTP ${res.status})`)
  const json = (await res.json()) as { status?: string; error?: string; results?: Array<{ side: string; url: string }> }
  if (json.status === 'error') throw new Error(json.error || 'Photo upload failed')
  return { results: json.results ?? [] }
}
export function useLogJointPackPhotos() {
  return useApiFn(logJointPackPhotos)
}

// ---------------------------------------------------------------------------
// NETA Tracker — mirrors the "STY4 NETA Tracker" Google Sheet (tabs: Submissions, Returned
// Files) via its own dedicated Apps Script web app — a third spreadsheet/script, separate from
// both CxAlloy's and Joint Pack Photo's (see NetaTrackerScript.gs, given to the user to deploy;
// not committed to this repo, same as the other two scripts aren't). Its URL lives in
// arcapp_settings under 'neta_tracker_script_url' — editable from Settings (as of 2026-09-25;
// used to be DB-only) so an admin can wire up a new project's deployment without needing a
// migration run for them.
//
// Unlike everything else that reads from a Sheet, this one writes BACK to it: toggling a
// checkbox or editing Comments in ArcApp calls updateNetaField, which sets that exact cell in the
// live sheet the field crew already works from, so ArcApp never becomes a second, drifting copy
// of the data. Row hierarchy (Zone > Area > Asset Category) comes from special marker rows the
// sheet uses in place of native row grouping (e.g. "ZONE HEADER: ZONE 1", "------ AREA: EY09
// ------", "[ ASSET CATEGORY: ATX-A ]") — the script parses these while walking the sheet and
// stamps every data row with the nearest one above it, so this file never needs to know that
// convention itself. Gated by `netaTrackerEnabled` (AppSettings, below) rather than a
// project.ts capability — an admin flips this on per-project from Settings once that project's
// own NETA Sheet/script is ready, no ArcApp code change/redeploy needed.
// ---------------------------------------------------------------------------

async function getNetaScriptUrl(): Promise<string> {
  const { netaTrackerEnabled, netaTrackerScriptUrl } = await getSettings()
  if (!netaTrackerEnabled) throw new Error('NETA Tracker isn’t enabled for this project.')
  if (!netaTrackerScriptUrl) throw new Error('NETA Tracker isn’t wired up yet — set the Apps Script URL in Settings.')
  return netaTrackerScriptUrl
}

export type NetaTab = 'Submissions' | 'Returned Files'

export type NetaSubmissionRow = {
  row: number
  zone: string
  area: string
  category: string
  documentName: string
  submittedDate: string
  folderLocation: string
  /** The sheet cell is `=HYPERLINK(url, "<label>")` — folderLocation is the label, this is the
   * target Drive folder URL (a per-equipment-category folder, or a fixed status folder like
   * "READY TO UPLOAD"). Empty if that cell isn't a HYPERLINK formula. */
  folderLocationUrl: string
  documentLink: string
  /** Same deal as folderLocationUrl — the Drive file's own view URL. Every row has one in
   * practice (778/778, 119/119 when this was checked), but treat as optional. */
  documentLinkUrl: string
  clericalReview: boolean
  submittedToGoogle: boolean
  issuesFound: boolean
  comments: string
}
export type NetaReturnedRow = {
  row: number
  zone: string
  area: string
  category: string
  documentName: string
  submittedDate: string
  folderLocation: string
  folderLocationUrl: string
  documentLink: string
  documentLinkUrl: string
  issues: string
  technicalReview: boolean
  /** The sheet has no checkbox here at all while `issues` isn't "None" (the cell literally holds
   * the text "N/A" instead) — a real state, not just "unchecked". See netaBoolOrNA. */
  stampPresent: boolean | 'N/A'
  netaCompleted: boolean
  uploadedToAcc: boolean | 'N/A'
  comments: string
}
export type NetaTrackerData = {
  submissions: NetaSubmissionRow[]
  returnedFiles: NetaReturnedRow[]
  syncedAt: string | null
}

function netaBool(v: unknown): boolean {
  return v === true || v === 'TRUE' || v === 'true'
}
function netaStr(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}
function netaBoolOrNA(v: unknown): boolean | 'N/A' {
  return typeof v === 'string' && v.trim().toUpperCase() === 'N/A' ? 'N/A' : netaBool(v)
}

async function getNetaTrackerData(): Promise<NetaTrackerData> {
  const scriptUrl = await getNetaScriptUrl()
  const url = new URL(scriptUrl)
  url.searchParams.set('action', 'getNetaData')
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`NETA Tracker request failed (HTTP ${res.status})`)
  const json = (await res.json()) as {
    status?: string
    error?: string
    syncedAt?: string
    submissions?: Array<Record<string, unknown>>
    returnedFiles?: Array<Record<string, unknown>>
  }
  if (json.status === 'error') throw new Error(json.error || 'NETA Tracker request failed')

  const submissions: NetaSubmissionRow[] = (json.submissions ?? []).map((r) => ({
    row: Number(r.row) || 0,
    zone: netaStr(r.zone),
    area: netaStr(r.area),
    category: netaStr(r.category),
    documentName: netaStr(r.documentName),
    submittedDate: netaStr(r.submittedDate),
    folderLocation: netaStr(r.folderLocation),
    folderLocationUrl: netaStr(r.folderLocationUrl),
    documentLink: netaStr(r.documentLink),
    documentLinkUrl: netaStr(r.documentLinkUrl),
    clericalReview: netaBool(r.clericalReview),
    submittedToGoogle: netaBool(r.submittedToGoogle),
    issuesFound: netaBool(r.issuesFound),
    comments: netaStr(r.comments),
  }))
  const returnedFiles: NetaReturnedRow[] = (json.returnedFiles ?? []).map((r) => ({
    row: Number(r.row) || 0,
    zone: netaStr(r.zone),
    area: netaStr(r.area),
    category: netaStr(r.category),
    documentName: netaStr(r.documentName),
    submittedDate: netaStr(r.submittedDate),
    folderLocation: netaStr(r.folderLocation),
    folderLocationUrl: netaStr(r.folderLocationUrl),
    documentLink: netaStr(r.documentLink),
    documentLinkUrl: netaStr(r.documentLinkUrl),
    issues: netaStr(r.issues),
    technicalReview: netaBool(r.technicalReview),
    stampPresent: netaBoolOrNA(r.stampPresent),
    netaCompleted: netaBool(r.netaCompleted),
    uploadedToAcc: netaBoolOrNA(r.uploadedToAcc),
    comments: netaStr(r.comments),
  }))
  return { submissions, returnedFiles, syncedAt: json.syncedAt ?? null }
}
export function useGetNetaTrackerData() {
  return useApiFn(getNetaTrackerData)
}

export type UpdateNetaFieldParams = {
  tab: NetaTab
  row: number
  field: string
  value: boolean | string
  /** Guards against a row having shifted (rows inserted/deleted) since this page's data was
   * loaded — the script refuses the write if column A of that row no longer matches. */
  expectedDocumentName: string
}
async function updateNetaField(params: UpdateNetaFieldParams): Promise<{ success: boolean }> {
  const scriptUrl = await getNetaScriptUrl()
  const res = await fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'updateNetaField', ...params }),
  })
  if (!res.ok) throw new Error(`Save failed (HTTP ${res.status})`)
  const json = (await res.json()) as { success?: boolean; error?: string }
  if (!json.success) throw new Error(json.error || 'Save failed.')
  return { success: true }
}
export function useUpdateNetaField() {
  return useApiFn(updateNetaField)
}

// ---------------------------------------------------------------------------
// RTFT — mirrors getRtft.ts / submitRtft.ts
// ---------------------------------------------------------------------------

export type RtftRow = {
  id: number
  created_at: string
  inspection_date: string
  equipment: string
  equipment_type: string
  ofe: boolean | null
  inspector: string
  ops_team_present: string
  cxa_present: string
  gc_present: string
  issues_found: string
  corrected_immediately: string
  issue_description: string
  entered_bim: string
  bim_issue_number: string
  l2_pass: string
  signoff: string
}
async function getRtft(): Promise<RtftRow[]> {
  // STY4RTFT only exists for STY4 today — see the `siteLogging` capability comment in
  // src/lib/project.ts. The RTFT page/section itself already hides behind this same check; this
  // is defense in depth for any other caller (e.g. ActivityDrawer's embedded RTFT section).
  if (!hasCapability('siteLogging')) return []
  const res = await supabase
    .from('STY4RTFT')
    .select(
      'id, created_at, inspection_date, equipment, equipment_type, ofe, inspector, ops_team_present, cxa_present, gc_present, issues_found, corrected_immediately, issue_description, entered_bim, bim_issue_number, l2_pass, signoff',
    )
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(1000)
  return unwrap(res) as RtftRow[]
}
export function useGetRtft() {
  return useApiFn(getRtft)
}

export type RtftInput = {
  date: string
  equipment: string
  equipmentType: string
  ofe: boolean
  inspector: string
  opsTeamPresent: string
  cxaPresent: string
  gcPresent: string
  issuesFound: string
  correctedImmediately: string
  issueDescription: string
  enteredBIM: string
  bimIssueNumber: string
  l2Pass: string
}
async function submitRtft(p: RtftInput): Promise<{ id: number }> {
  if (!hasCapability('siteLogging')) throw new Error('RTFT logging isn’t available for this project yet.')
  const signoff = await getCurrentUserEmail()
  const res = await supabase
    .from('STY4RTFT')
    .insert({
      inspection_date: p.date,
      equipment: p.equipment,
      equipment_type: p.equipmentType,
      ofe: p.ofe,
      inspector: p.inspector,
      ops_team_present: p.opsTeamPresent,
      cxa_present: p.cxaPresent,
      gc_present: p.gcPresent,
      issues_found: p.issuesFound,
      corrected_immediately: p.correctedImmediately,
      issue_description: p.issueDescription,
      entered_bim: p.enteredBIM,
      bim_issue_number: p.bimIssueNumber,
      l2_pass: p.l2Pass,
      signoff,
    })
    .select('id')
    .single()
  const row = unwrap(res) as { id: number }
  return { id: row?.id ?? 0 }
}
export function useSubmitRtft() {
  return useApiFn(submitRtft)
}

// ---------------------------------------------------------------------------
// schedule — mirrors getSchedule.ts / saveResult.ts
// ---------------------------------------------------------------------------

export type ScheduleRowDTO = {
  id: number
  date: string
  time: string
  place: string
  activity: string
  asset: string
  trade: string
  status: string
  loto: boolean
  result: string
}
async function getSchedule(params: { date: string }): Promise<ScheduleRowDTO[]> {
  const res = await supabase
    .from(`${CXALLOY_TABLE_PREFIX}BackEndData`)
    .select('id, day_label, time, place, activity, asset, status, trade_partners, result, loto')
    .eq('day_label', params.date)
    .order('time', { ascending: true })
    .limit(200)
  const rows = unwrap(res) as Array<{
    id: number
    day_label: string | null
    time: string | null
    place: string | null
    activity: string | null
    asset: string | null
    status: string | null
    trade_partners: string | null
    result: string | null
    loto: string | null
  }>
  return rows.map((r) => ({
    id: r.id,
    date: r.day_label || params.date,
    time: r.time || '\u2014',
    place: r.place || '\u2014',
    activity: r.activity || '\u2014',
    asset: r.asset || '\u2014',
    trade: r.trade_partners || '\u2014',
    status: stripHtml(r.status) || 'NA',
    loto: (r.loto || '').toString().trim().toLowerCase() === 'yes',
    result: stripHtml(r.result) || '\u2014',
  }))
}
export function useGetSchedule() {
  return useApiFn(getSchedule)
}

async function saveResult(params: { id: number | string; result: string }): Promise<{ id: number | string; result: string }> {
  const res = await supabase.from(`${CXALLOY_TABLE_PREFIX}BackEndData`).update({ result: params.result }).eq('id', params.id)
  if (res.error) throw new Error(res.error.message)
  return { id: params.id, result: params.result }
}
export function useSaveResult() {
  return useApiFn(saveResult)
}

// ---------------------------------------------------------------------------
// settings — mirrors getSettings.ts / saveSetting.ts (now backed by Supabase, not Retool DB)
// ---------------------------------------------------------------------------

/** A team-or-person assignment target — same "at most one of team or person" shape as a task's own
 * assignment fields (structurally identical to AssignPopover's AssignResult, so either can be
 * passed where the other is expected without importing a UI component into this data layer). */
export type DefaultAssignee = { teamId: string | null; email: string | null; name: string | null }
const EMPTY_ASSIGNEE: DefaultAssignee = { teamId: null, email: null, name: null }

export type AppSettings = {
  jointPackPhotosFolder: string
  /** Per-project on/off switch for the whole Joint Pack Photos module (page, nav item) — added
   * 2026-09-25 alongside making its Apps Script URL Settings-editable (jointPackScriptUrl below),
   * since a newly-onboarded project shouldn't show the page (and error on load) before its own
   * Sheet/script exists. Off by default for any project until set — including STY4, seeded on so
   * its existing behavior doesn't change. */
  jointPackEnabled: boolean
  /** Apps Script Web App /exec URL for Joint Pack Photos — editable from Settings as of
   * 2026-09-25 (used to be DB-only), same reasoning as netaTrackerScriptUrl below. */
  jointPackScriptUrl: string
  /** Per-project on/off switch for the whole NETA Tracker module (page, nav item, and its To-Do
   * integration) — moved here from a project.ts capability constant on 2026-09-25 so an admin can
   * turn it on for a newly-onboarded site themselves, once that site's own NETA Sheet/script is
   * ready, without a code change/redeploy. Off by default for any project until set. */
  netaTrackerEnabled: boolean
  /** Apps Script Web App /exec URL for NETA Tracker — editable from Settings as of 2026-09-25
   * (used to be DB-only, set directly in Supabase for every new project). */
  netaTrackerScriptUrl: string
  /** Per-project on/off switch for Asset Attributes (page, nav item) — added 2026-09-25. Separate
   * from `cxAlloyActions` on purpose: getEquipmentAttributes/saveAttributes/saveImageOnly/ocrImage
   * are pre-existing LaunchPad actions (not an ArcApp addition to the script), so this can be
   * enabled independently of whether Checklists/Issues are. Off by default for any project until
   * set — including STY4, seeded on so its existing behavior doesn't change. */
  assetAttributesEnabled: boolean
  checklistReadyStatuses: string[]
  issueReviewStatuses: string[]
  /** Company name to keep issues from, matched against Created By (either directly, for a shared
   * org account, or via the People tab's Name/Company columns for an individual) — see
   * filterByCreatorCompany. Blank (off, shows every issue) by default; requires the `getPeople`
   * Apps Script action (AppendPeopleAction.gs) to be deployed before turning this on, or every
   * issue gets filtered out instead of erroring (see getPeople's own comment). */
  issueCreatorCompanyFilter: string
  /** Assets marked "not reviewable" — excluded entirely from the Submittals page's missing-
   * coverage count (they'll never need a submittal, so they shouldn't count against the total). */
  submittalExemptAssets: string[]
  /** Checklist/Issue To-Do (see arcapp_item_assignments) — off by default. "Still open" isn't a
   * separately configured list: it's derived as every live CxAlloy status NOT in
   * checklistReadyStatuses/issueReviewStatuses above (see getOpenChecklists/getOpenIssues). */
  checklistTodoEnabled: boolean
  issueTodoEnabled: boolean
  /** NETA Tracker To-Do — same assignment mechanism as Checklist/Issue To-Do, but "still open"
   * isn't a configurable status list here: it's the same fixed not-yet-completed definition the
   * NETA Tracker page itself uses (Submissions: not yet Submitted to Google; Returned Files: not
   * yet Uploaded to ACC), so there's no open-status picker to configure. Off by default. */
  netaSubmissionsTodoEnabled: boolean
  netaReturnedTodoEnabled: boolean
  /** Default assignee per To-Do category (requested 2026-09-24) — when set and there's at least
   * one open item in that category, the assigned team/person gets a single summary card in "Your
   * To-Dos" (e.g. "Issues need to be reviewed (12 open)"), rather than every individual open item
   * being assigned to them. Blank (no default) by default. */
  checklistDefaultAssignee: DefaultAssignee
  issueDefaultAssignee: DefaultAssignee
  netaSubmissionsDefaultAssignee: DefaultAssignee
  netaReturnedDefaultAssignee: DefaultAssignee
  /** Manual override for the auto-detected CxAlloy domain+project id (see getCxAlloyLinkBase in
   * this file) — "domain/projectId", e.g. "google.cxalloy.com/70". Blank by default; only needed
   * if auto-detection can't find one (no Equipment Tracker data synced yet for this project) or
   * finds the wrong one. AppShell.tsx logs/resolves the effective value here so it's visible
   * without opening dev tools. */
  cxalloyLinkBaseOverride: string
}
const SETTINGS_DEFAULTS = {
  checklistReadyStatuses: ['Finished'],
  issueReviewStatuses: ['Pending Verification'],
  submittalExemptAssets: [] as string[],
}
function splitCsv(v: string | undefined, fallback: string[]): string[] {
  if (v === undefined || v === null) return fallback
  const parts = v.split(',').map((s) => s.trim()).filter(Boolean)
  return parts.length ? parts : fallback
}
function parseDefaultAssignee(map: Map<string, string>, prefix: string): DefaultAssignee {
  return {
    teamId: map.get(`${prefix}_team_id`) || null,
    email: map.get(`${prefix}_email`) || null,
    name: map.get(`${prefix}_name`) || null,
  }
}
async function getSettings(): Promise<AppSettings> {
  const res = await supabase.from('arcapp_settings').select('setting_key, setting_value').eq('project_key', CURRENT_PROJECT)
  const rows = unwrap(res) as Array<{ setting_key: string; setting_value: string | null }>
  const map = new Map(rows.map((r) => [r.setting_key, r.setting_value ?? '']))
  return {
    jointPackPhotosFolder: map.get('joint_pack_photos_folder') ?? '',
    jointPackEnabled: map.get('joint_pack_enabled') === 'true',
    jointPackScriptUrl: map.get('joint_pack_script_url') ?? '',
    netaTrackerEnabled: map.get('neta_tracker_enabled') === 'true',
    netaTrackerScriptUrl: map.get('neta_tracker_script_url') ?? '',
    assetAttributesEnabled: map.get('asset_attributes_enabled') === 'true',
    checklistReadyStatuses: splitCsv(map.get('checklist_ready_statuses'), SETTINGS_DEFAULTS.checklistReadyStatuses),
    issueReviewStatuses: splitCsv(map.get('issue_review_statuses'), SETTINGS_DEFAULTS.issueReviewStatuses),
    issueCreatorCompanyFilter: map.get('issue_creator_company_filter') ?? '',
    submittalExemptAssets: splitCsv(map.get('submittal_exempt_assets'), SETTINGS_DEFAULTS.submittalExemptAssets),
    checklistTodoEnabled: map.get('checklist_todo_enabled') === 'true',
    issueTodoEnabled: map.get('issue_todo_enabled') === 'true',
    netaSubmissionsTodoEnabled: map.get('neta_submissions_todo_enabled') === 'true',
    netaReturnedTodoEnabled: map.get('neta_returned_todo_enabled') === 'true',
    checklistDefaultAssignee: parseDefaultAssignee(map, 'checklist_default_assignee'),
    issueDefaultAssignee: parseDefaultAssignee(map, 'issue_default_assignee'),
    netaSubmissionsDefaultAssignee: parseDefaultAssignee(map, 'neta_submissions_default_assignee'),
    netaReturnedDefaultAssignee: parseDefaultAssignee(map, 'neta_returned_default_assignee'),
    cxalloyLinkBaseOverride: map.get('cxalloy_link_base_override') ?? '',
  }
}
export function useGetSettings() {
  return useApiFn(getSettings)
}

const ALLOWED_SETTING_KEYS = new Set([
  'joint_pack_photos_folder',
  'joint_pack_enabled',
  'joint_pack_script_url',
  'neta_tracker_enabled',
  'neta_tracker_script_url',
  'asset_attributes_enabled',
  'checklist_ready_statuses',
  'issue_review_statuses',
  'issue_creator_company_filter',
  'submittal_exempt_assets',
  'checklist_todo_enabled',
  'issue_todo_enabled',
  'neta_submissions_todo_enabled',
  'neta_returned_todo_enabled',
  'checklist_default_assignee_team_id',
  'checklist_default_assignee_email',
  'checklist_default_assignee_name',
  'issue_default_assignee_team_id',
  'issue_default_assignee_email',
  'issue_default_assignee_name',
  'neta_submissions_default_assignee_team_id',
  'neta_submissions_default_assignee_email',
  'neta_submissions_default_assignee_name',
  'neta_returned_default_assignee_team_id',
  'neta_returned_default_assignee_email',
  'neta_returned_default_assignee_name',
  'cxalloy_link_base_override',
])
async function saveSetting(params: { key: string; value: string }): Promise<{ key: string; value: string }> {
  if (!ALLOWED_SETTING_KEYS.has(params.key)) throw new Error(`Unknown setting key: ${params.key}`)
  const updatedBy = (await getCurrentUserEmail()) || 'admin'
  const res = await supabase
    .from('arcapp_settings')
    .upsert(
      { project_key: CURRENT_PROJECT, setting_key: params.key, setting_value: params.value, updated_by: updatedBy, updated_at: new Date().toISOString() },
      { onConflict: 'project_key,setting_key' },
    )
  if (res.error) throw new Error(res.error.message)
  return { key: params.key, value: params.value }
}
export function useSaveSetting() {
  return useApiFn(saveSetting)
}

/** Saves all three fields of a default-assignee setting (Settings → per-category "default
 * assignee") in one call, so the picker component doesn't have to sequence three separate
 * onSaveSetting calls itself. `prefix` is the setting-key prefix, e.g. "checklist_default_assignee". */
async function saveDefaultAssignee(params: { prefix: string } & DefaultAssignee): Promise<DefaultAssignee> {
  const { prefix, teamId, email, name } = params
  await Promise.all([
    saveSetting({ key: `${prefix}_team_id`, value: teamId ?? '' }),
    saveSetting({ key: `${prefix}_email`, value: email ?? '' }),
    saveSetting({ key: `${prefix}_name`, value: name ?? '' }),
  ])
  return teamId || email || name ? { teamId, email, name } : EMPTY_ASSIGNEE
}
export function useSaveDefaultAssignee() {
  return useApiFn(saveDefaultAssignee)
}

// ---------------------------------------------------------------------------
// submittals — replaces the old one-row-per-asset STY4Submittals model. A submittal is now its
// own record (a title + an uploaded file) that applies to a whole SET of assets at once
// (`assets`, a jsonb array) — editing its review_status/notes updates it for every one of those
// assets simultaneously, since they all point at the same row instead of each having their own.
// Files upload to the "submittals" Supabase Storage bucket (public bucket; only authorized
// editors can write to it — see supabase/policies.sql).
// ---------------------------------------------------------------------------

export type SubmittalNote = { text: string; author: string; at: string }

export type Submittal = {
  id: string
  title: string
  fileUrl: string
  fileName: string
  assets: string[]
  reviewStatus: string
  /** Append-only — see addSubmittalNote(). The old single overwritable `notes` text column still
   * exists in the table but is no longer read or written; nothing needed to migrate since there
   * was no real data in it yet. */
  notesLog: SubmittalNote[]
  updatedBy: string
  updatedAt: string
  createdAt: string
}
function parseNotesLog(raw: unknown): SubmittalNote[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
    .map((n) => ({ text: String(n.text ?? ''), author: String(n.author ?? ''), at: String(n.at ?? '') }))
}
async function getSubmittalsList(): Promise<Submittal[]> {
  const res = await supabase
    .from('arcapp_submittals')
    .select('id, title, file_url, file_name, assets, review_status, notes_log, updated_by, updated_at, created_at')
    .eq('project_key', CURRENT_PROJECT)
    .order('created_at', { ascending: false })
  const rows = unwrap(res) as Array<{
    id: string
    title: string | null
    file_url: string | null
    file_name: string | null
    assets: unknown
    review_status: string | null
    notes_log: unknown
    updated_by: string | null
    updated_at: string | null
    created_at: string | null
  }>
  return rows.map((r) => ({
    id: r.id,
    title: r.title || '',
    fileUrl: r.file_url || '',
    fileName: r.file_name || '',
    assets: Array.isArray(r.assets) ? (r.assets as string[]) : [],
    reviewStatus: r.review_status || '',
    notesLog: parseNotesLog(r.notes_log),
    updatedBy: r.updated_by || '',
    updatedAt: r.updated_at || '',
    createdAt: r.created_at || '',
  }))
}
export function useGetSubmittalsList() {
  return useApiFn(getSubmittalsList)
}

async function addSubmittalNote(params: { id: string; text: string }): Promise<SubmittalNote[]> {
  const text = params.text.trim()
  if (!text) throw new Error('Note text is required.')
  const current = await supabase.from('arcapp_submittals').select('notes_log').eq('id', params.id).single()
  if (current.error) throw new Error(current.error.message)
  const existing = parseNotesLog((current.data as { notes_log: unknown } | null)?.notes_log)
  const author = (await getCurrentUserEmail()) || 'anonymous'
  const nextLog: SubmittalNote[] = [...existing, { text, author, at: new Date().toISOString() }]
  const res = await supabase.from('arcapp_submittals').update({ notes_log: nextLog }).eq('id', params.id).select('notes_log').single()
  if (res.error) throw new Error(res.error.message)
  return parseNotesLog((res.data as { notes_log: unknown }).notes_log)
}
export function useAddSubmittalNote() {
  return useApiFn(addSubmittalNote)
}

// Every submittal always has a real status starting at "Not Started" — there's no blank/unset
// state once one's been uploaded, so the UI never needs to render a "no status" option.
export const SUBMITTAL_STATUSES = ['Not Started', 'In Review', 'Approved', 'Rejected'] as const
const ALLOWED_SUBMITTAL_STATUSES = new Set<string>(SUBMITTAL_STATUSES)

async function uploadSubmittalFile(params: { file: File }): Promise<{ url: string; name: string }> {
  const ext = params.file.name.includes('.') ? params.file.name.split('.').pop() : ''
  const path = `${Date.now()}_${Math.random().toString(16).slice(2)}${ext ? '.' + ext : ''}`
  const res = await supabase.storage.from('submittals').upload(path, params.file)
  if (res.error) throw new Error(res.error.message)
  const { data } = supabase.storage.from('submittals').getPublicUrl(res.data.path)
  return { url: data.publicUrl, name: params.file.name }
}
export function useUploadSubmittalFile() {
  return useApiFn(uploadSubmittalFile)
}

export type SubmittalInput = {
  id?: string
  title: string
  fileUrl: string
  fileName: string
  assets: string[]
  reviewStatus: string
}
async function saveSubmittalRecord(params: SubmittalInput): Promise<{ id: string }> {
  const title = params.title.trim()
  if (!title) throw new Error('A title is required.')
  if (!ALLOWED_SUBMITTAL_STATUSES.has(params.reviewStatus)) throw new Error(`Invalid review status: ${params.reviewStatus}`)
  const updatedBy = (await getCurrentUserEmail()) || 'admin'
  const record: Record<string, unknown> = {
    project_key: CURRENT_PROJECT,
    title,
    file_url: params.fileUrl,
    file_name: params.fileName,
    assets: params.assets,
    review_status: params.reviewStatus,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  }
  if (params.id) record.id = params.id
  const res = await supabase.from('arcapp_submittals').upsert(record, { onConflict: 'id' }).select('id').single()
  const row = unwrap(res) as { id: string }
  return { id: row.id }
}
export function useSaveSubmittalRecord() {
  return useApiFn(saveSubmittalRecord)
}

async function deleteSubmittalRecord(params: { id: string }): Promise<{ id: string }> {
  const res = await supabase.from('arcapp_submittals').delete().eq('id', params.id)
  if (res.error) throw new Error(res.error.message)
  return { id: params.id }
}
export function useDeleteSubmittalRecord() {
  return useApiFn(deleteSubmittalRecord)
}

// ---------------------------------------------------------------------------
// tamper seals — mirrors getTamperSeals.ts / logTamperSeals.ts
// ---------------------------------------------------------------------------

export type TamperSealRow = {
  id: number
  asset_name: string
  location: string
  sub_area: string
  seal_number: string
  inspection_date: string
  inspection_notes: string
  signoff: string
  status: string
  responsible_party: string
  break_date: string
  break_reason: string
  created_at: string
}
async function getTamperSeals(): Promise<TamperSealRow[]> {
  // STY4Assets only exists for STY4 today — see the `siteLogging` capability comment in
  // src/lib/project.ts. The Tamper Seals page/section already hides behind this same check; this
  // is defense in depth for any other caller (e.g. ActivityDrawer's embedded seal section).
  if (!hasCapability('siteLogging')) return []
  const res = await supabase
    .from('STY4Assets')
    .select(
      'id, asset_name, location, sub_area, seal_number, inspection_date, inspection_notes, signoff, status, responsible_party, break_date, break_reason, created_at',
    )
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(1000)
  const rows = unwrap(res) as TamperSealRow[]
  return rows.map((r) => ({
    id: r.id,
    asset_name: r.asset_name || '',
    location: r.location || '',
    sub_area: r.sub_area || '',
    seal_number: r.seal_number || '',
    inspection_date: r.inspection_date || '',
    inspection_notes: r.inspection_notes || '',
    signoff: r.signoff || '',
    status: r.status || '',
    responsible_party: r.responsible_party || '',
    break_date: r.break_date || '',
    break_reason: r.break_reason || '',
    created_at: r.created_at || '',
  }))
}
export function useGetTamperSeals() {
  return useApiFn(getTamperSeals)
}

export type SealInput = {
  asset_name: string
  location: string
  sub_area: string
  seal_number: string
  inspection_date: string
  inspection_notes: string
  status: string
}
async function logTamperSeals(params: { rows: SealInput[] }): Promise<{ inserted: number }> {
  const rows = params.rows || []
  if (rows.length === 0) return { inserted: 0 }
  if (!hasCapability('siteLogging')) throw new Error('Tamper Seal logging isn’t available for this project yet.')
  const signoff = await getCurrentUserEmail()
  const records = rows.map((r) => ({
    asset_name: r.asset_name,
    location: r.location,
    sub_area: r.sub_area,
    seal_number: r.seal_number,
    inspection_date: r.inspection_date,
    inspection_notes: r.inspection_notes,
    signoff,
    status: r.status || 'Intact',
  }))
  const res = await supabase.from('STY4Assets').insert(records)
  if (res.error) throw new Error(res.error.message)
  return { inserted: rows.length }
}
export function useLogTamperSeals() {
  return useApiFn(logTamperSeals)
}

// ---------------------------------------------------------------------------
// workflow items — the catalog of on-site modules a workflow can include.
// Backed by arcapp_workflow_items; each row will later also carry the definition of what the
// item does (its `config` jsonb). New in this app — no Retool equivalent.
// ---------------------------------------------------------------------------

export type { WorkflowItem }

/**
 * Reads the item catalog. Falls back to the built-in list if the table is missing or empty so the
 * app still works before supabase/schema.sql has been applied.
 */
async function getWorkflowItems(): Promise<WorkflowItem[]> {
  const res = await supabase
    .from('arcapp_workflow_items')
    .select('item_key, label, description, sort_order, enabled')
    .order('sort_order', { ascending: true, nullsFirst: false })

  if (res.error) {
    console.warn(`arcapp_workflow_items unavailable (${res.error.message}); using built-in item list.`)
    return FALLBACK_WORKFLOW_ITEMS
  }
  const rows = (res.data ?? []) as Array<{
    item_key: string
    label: string | null
    description: string | null
    sort_order: number | null
    enabled: boolean | null
  }>
  if (rows.length === 0) return FALLBACK_WORKFLOW_ITEMS

  return rows.map((r, idx) => ({
    key: String(r.item_key),
    label: r.label || String(r.item_key),
    description: r.description || '',
    sortOrder: r.sort_order ?? idx,
    enabled: r.enabled !== false,
  }))
}
export function useGetWorkflowItems() {
  return useApiFn(getWorkflowItems)
}

const ITEM_KEY_RE = /^[a-z][a-z0-9_]*$/

/** Suggests an item_key from a label ("Equipment Photos" -> "equipment_photos"). Editable by the admin before first save. */
export function slugifyItemKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Creates or updates one catalog row (upsert on item_key). Only the presentation/availability
 * fields are writable here — the `config` payload that defines an item's behavior gets its own
 * editor once those are specified. Key format is enforced because it's stored verbatim inside
 * arcapp_workflows.items and should never need re-encoding once a workflow references it.
 */
async function saveWorkflowItem(params: {
  key: string
  label: string
  description: string
  enabled: boolean
  sortOrder: number
}): Promise<{ key: string }> {
  const key = (params.key ?? '').trim().toLowerCase()
  const label = (params.label ?? '').trim()
  if (!key || !ITEM_KEY_RE.test(key)) {
    throw new Error('Key must start with a letter and contain only lowercase letters, numbers, and underscores.')
  }
  if (!label) throw new Error('A label is required.')
  const updatedBy = (await getCurrentUserEmail()) || 'admin'

  const res = await supabase.from('arcapp_workflow_items').upsert(
    {
      item_key: key,
      label,
      description: params.description ?? '',
      enabled: params.enabled,
      sort_order: params.sortOrder,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: 'item_key' },
  )
  if (res.error) throw new Error(res.error.message)
  return { key }
}
export function useSaveWorkflowItem() {
  return useApiFn(saveWorkflowItem)
}

/** Deletes a catalog row outright. Callers should confirm no workflow still references the key first. */
async function deleteWorkflowItem(params: { key: string }): Promise<{ key: string }> {
  const key = (params.key ?? '').trim()
  if (!key) throw new Error('An item key is required.')
  const res = await supabase.from('arcapp_workflow_items').delete().eq('item_key', key)
  if (res.error) throw new Error(res.error.message)
  return { key }
}
export function useDeleteWorkflowItem() {
  return useApiFn(deleteWorkflowItem)
}

// ---------------------------------------------------------------------------
// workflows — mirrors getWorkflows.ts / saveWorkflows.ts (now backed by Supabase)
// ---------------------------------------------------------------------------

export type Workflow = {
  id: string
  activities: string[]
  items: string[]
}
function toStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed.map((x) => String(x)) : []
    } catch {
      return []
    }
  }
  return []
}
async function getWorkflows(): Promise<Workflow[]> {
  const res = await supabase
    .from('arcapp_workflows')
    .select('id, activities, items')
    .eq('project_key', CURRENT_PROJECT)
    .order('created_at', { ascending: true, nullsFirst: false })
  const rows = unwrap(res) as Array<{ id: string; activities: unknown; items: unknown }>
  return rows.map((r) => ({ id: String(r.id), activities: toStrArray(r.activities), items: toStrArray(r.items) }))
}
export function useGetWorkflows() {
  return useApiFn(getWorkflows)
}

async function saveWorkflows(params: { workflows: Workflow[] }): Promise<{ count: number }> {
  const incoming = Array.isArray(params.workflows) ? params.workflows : []
  const updatedBy = (await getCurrentUserEmail()) || 'admin'

  // Valid item keys come from the catalog table, so adding an item is a data change, not a deploy.
  const validItems = new Set((await getWorkflowItems()).map((i) => i.key))

  const clean: Workflow[] = incoming.map((w) => {
    const activities = (Array.isArray(w.activities) ? w.activities : [])
      .map((a) => (a ?? '').toString().trim())
      .filter(Boolean)
    const items = (Array.isArray(w.items) ? w.items : []).filter((i) => validItems.has(i))
    if (!w.id) throw new Error('Every workflow needs an id.')
    if (activities.length === 0) throw new Error('Every workflow needs at least one activity.')
    if (items.length === 0) throw new Error('Every workflow needs at least one item.')
    return { id: String(w.id), activities, items }
  })

  const seen = new Set<string>()
  for (const w of clean) {
    for (const a of w.activities) {
      const key = a.toLowerCase()
      if (seen.has(key)) throw new Error(`Activity "${a}" is assigned to more than one workflow.`)
      seen.add(key)
    }
  }

  // Reconcile by id: delete rows no longer present, then upsert the rest. Scoped to the current
  // project on both the read and the delete — without this, "no longer present" would compare
  // against every project's workflow ids at once and delete other projects' rows out from under
  // them.
  const existingRes = await supabase.from('arcapp_workflows').select('id').eq('project_key', CURRENT_PROJECT)
  const existingIds = (unwrap(existingRes) as Array<{ id: string }>).map((r) => r.id)
  const keepIds = new Set(clean.map((w) => w.id))
  const toDelete = existingIds.filter((id) => !keepIds.has(id))
  if (toDelete.length > 0) {
    const delRes = await supabase.from('arcapp_workflows').delete().in('id', toDelete)
    if (delRes.error) throw new Error(delRes.error.message)
  }

  if (clean.length > 0) {
    const upsertRes = await supabase.from('arcapp_workflows').upsert(
      clean.map((w) => ({
        id: w.id,
        project_key: CURRENT_PROJECT,
        activities: w.activities,
        items: w.items,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      })),
      { onConflict: 'id' },
    )
    if (upsertRes.error) throw new Error(upsertRes.error.message)
  }

  return { count: clean.length }
}
export function useSaveWorkflows() {
  return useApiFn(saveWorkflows)
}

// ---------------------------------------------------------------------------
// teams — the roster used to assign To-Do tasks. New tables (arcapp_teams, arcapp_tasks); see
// supabase/schema.sql. Open to anon + authenticated, same as arcapp_workflows (see policies.sql)
// — no sign-in required to build teams or create/assign tasks, by request.
// ---------------------------------------------------------------------------

export type { Team, TeamMember }

function toTeam(r: { id: string; name: string; members: unknown }): Team {
  return {
    id: r.id,
    name: r.name,
    members: Array.isArray(r.members) ? (r.members as TeamMember[]) : [],
  }
}
async function getTeams(): Promise<Team[]> {
  const res = await supabase.from('arcapp_teams').select('id, name, members').eq('project_key', CURRENT_PROJECT).order('name', { ascending: true })
  const rows = unwrap(res) as Array<{ id: string; name: string; members: unknown }>
  return rows.map(toTeam)
}
export function useGetTeams() {
  return useApiFn(getTeams)
}

export type TeamInput = { id?: string; name: string; members: TeamMember[] }
async function saveTeam(params: TeamInput): Promise<{ id: string }> {
  const name = params.name.trim()
  if (!name) throw new Error('A team name is required.')
  const members = params.members.map((m) => ({ name: m.name.trim(), email: m.email.trim() })).filter((m) => m.name)
  const updatedBy = (await getCurrentUserEmail()) || 'anonymous'

  const record = { name, members, updated_at: new Date().toISOString(), updated_by: updatedBy }
  const res = params.id
    ? await supabase.from('arcapp_teams').update(record).eq('id', params.id).select('id').single()
    : await supabase
        .from('arcapp_teams')
        .insert({ ...record, project_key: CURRENT_PROJECT })
        .select('id')
        .single()
  const row = unwrap(res) as { id: string }
  return { id: row.id }
}
export function useSaveTeam() {
  return useApiFn(saveTeam)
}

async function deleteTeam(params: { id: string }): Promise<{ id: string }> {
  const res = await supabase.from('arcapp_teams').delete().eq('id', params.id)
  if (res.error) throw new Error(res.error.message)
  return { id: params.id }
}
export function useDeleteTeam() {
  return useApiFn(deleteTeam)
}

// ---------------------------------------------------------------------------
// tasks — the real, persisted To-Do list (arcapp_tasks). Replaces the old hardcoded sample data
// in sampleData.ts. A task is assigned to at most one of: a team (assignedTeamId) or a specific
// person (assignedEmail/assignedName) — never both.
// ---------------------------------------------------------------------------

function toTodo(r: Record<string, unknown>): Todo {
  const tag = r.tag as string
  return {
    id: String(r.id),
    text: (r.text as string) ?? '',
    tag: tag === 'crit' || tag === 'high' ? (tag as TaskTag) : 'norm',
    sys: (r.sys as string) ?? '',
    dueDate: (r.due_date as string | null) ?? null,
    done: !!r.done,
    completedAt: (r.completed_at as string | null) ?? null,
    assignedTeamId: (r.assigned_team_id as string | null) ?? null,
    assignedEmail: (r.assigned_email as string | null) ?? null,
    assignedName: (r.assigned_name as string | null) ?? null,
  }
}
async function getTasks(): Promise<Todo[]> {
  const res = await supabase
    .from('arcapp_tasks')
    .select('id, text, tag, sys, due_date, done, completed_at, assigned_team_id, assigned_email, assigned_name')
    .eq('project_key', CURRENT_PROJECT)
    .order('done', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
  const rows = unwrap(res) as Array<Record<string, unknown>>
  return rows.map(toTodo)
}
export function useGetTasks() {
  return useApiFn(getTasks)
}

export type TaskInput = {
  id?: string
  text: string
  tag: TaskTag
  sys: string
  dueDate: string | null
  assignedTeamId: string | null
  assignedEmail: string | null
  assignedName: string | null
}
async function saveTask(params: TaskInput): Promise<{ id: string }> {
  const text = params.text.trim()
  if (!text) throw new Error('Task text is required.')
  const who = (await getCurrentUserEmail()) || 'anonymous'

  const record: Record<string, unknown> = {
    text,
    tag: params.tag,
    sys: params.sys.trim(),
    due_date: params.dueDate || null,
    assigned_team_id: params.assignedTeamId,
    assigned_email: params.assignedEmail,
    assigned_name: params.assignedName,
    updated_at: new Date().toISOString(),
    updated_by: who,
  }
  const res = params.id
    ? await supabase.from('arcapp_tasks').update(record).eq('id', params.id).select('id').single()
    : await supabase
        .from('arcapp_tasks')
        .insert({ ...record, project_key: CURRENT_PROJECT, created_by: who })
        .select('id')
        .single()
  const row = unwrap(res) as { id: string }
  return { id: row.id }
}
export function useSaveTask() {
  return useApiFn(saveTask)
}

async function setTaskDone(params: { id: string; done: boolean }): Promise<{ id: string; done: boolean }> {
  const res = await supabase
    .from('arcapp_tasks')
    .update({
      done: params.done,
      completed_at: params.done ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
  if (res.error) throw new Error(res.error.message)
  return { id: params.id, done: params.done }
}
export function useSetTaskDone() {
  return useApiFn(setTaskDone)
}

async function deleteTask(params: { id: string }): Promise<{ id: string }> {
  const res = await supabase.from('arcapp_tasks').delete().eq('id', params.id)
  if (res.error) throw new Error(res.error.message)
  return { id: params.id }
}
export function useDeleteTask() {
  return useApiFn(deleteTask)
}

// ---------------------------------------------------------------------------
// authorized users — who may sign in to ArcApp at all, and whether they're an admin or editor
// (arcapp_authorized_users). As of 2026-09-24 this table is the entire access-control model for
// ArcApp: no `role` here means no access to the site at all (see the `!user` gate in AppShell.tsx)
// — deliberately its own table, never STY4authorized_editors (LaunchPad's shared edit-rights
// table, with its own separate is_admin/role columns for a different purpose). The actual sign-in
// gate (checking a freshly signed-in email against this table and signing back out if absent)
// lives in src/lib/useCurrentUser.ts, not here — this section is just the admin management CRUD,
// admin-gated (not just editor-gated) since managing who can sign in and who's an admin is itself
// an admin-only action.
// ---------------------------------------------------------------------------

export type UserRole = 'admin' | 'editor'
export type AuthorizedUser = { id: string; email: string; name: string; role: UserRole }

async function getAuthorizedUsers(): Promise<AuthorizedUser[]> {
  const res = await supabase.from('arcapp_authorized_users').select('id, email, name, role').order('email', { ascending: true })
  const rows = unwrap(res) as Array<{ id: string; email: string; name: string | null; role: string | null }>
  return rows.map((r) => ({ id: r.id, email: r.email, name: r.name ?? '', role: r.role === 'admin' ? 'admin' : 'editor' }))
}
export function useGetAuthorizedUsers() {
  return useApiFn(getAuthorizedUsers)
}

async function saveAuthorizedUser(params: { id?: string; email: string; name: string; role: UserRole }): Promise<{ id: string }> {
  const email = params.email.trim().toLowerCase()
  if (!email) throw new Error('An email is required.')
  const who = (await getCurrentUserEmail()) || 'admin'

  const record = { email, name: params.name.trim(), role: params.role, added_by: who }
  const res = params.id
    ? await supabase.from('arcapp_authorized_users').update(record).eq('id', params.id).select('id').single()
    : await supabase.from('arcapp_authorized_users').insert(record).select('id').single()
  const row = unwrap(res) as { id: string }
  return { id: row.id }
}
export function useSaveAuthorizedUser() {
  return useApiFn(saveAuthorizedUser)
}

async function deleteAuthorizedUser(params: { id: string }): Promise<{ id: string }> {
  const res = await supabase.from('arcapp_authorized_users').delete().eq('id', params.id)
  if (res.error) throw new Error(res.error.message)
  return { id: params.id }
}
export function useDeleteAuthorizedUser() {
  return useApiFn(deleteAuthorizedUser)
}
