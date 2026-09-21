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
import { FALLBACK_WORKFLOW_ITEMS, type WorkflowItem } from '../pages/arcapp/workflowItems'
import type { Team, TeamMember, Todo, TaskTag } from '../pages/arcapp/types'

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

// ---------------------------------------------------------------------------
// checkEditor — mirrors backend/rno04/checkEditor.ts
// ---------------------------------------------------------------------------

export type EditorPermission = {
  email: string | null
  isAuthorized: boolean
  role: string | null
  company: string | null
}

async function checkEditor(): Promise<EditorPermission> {
  const email = (await getCurrentUserEmail()).toLowerCase().trim()
  if (!email) return { email: null, isAuthorized: false, role: null, company: null }

  const res = await supabase
    .from('STY4authorized_editors')
    .select('is_admin, company, role')
    .ilike('email', email)
    .limit(1)
    .maybeSingle()

  if (res.error) throw new Error(res.error.message)
  const row = res.data as { is_admin: boolean | null; company: string | null; role: string | null } | null
  if (!row) return { email, isAuthorized: false, role: null, company: null }
  const role = row.role || (row.is_admin ? 'admin' : 'editor')
  return { email, isAuthorized: true, role, company: row.company }
}
export function useCheckEditor() {
  return useApiFn(checkEditor)
}

// ---------------------------------------------------------------------------
// dropdown options — mirrors getActivityOptions / getAssetOptions / getResultOptions
// ---------------------------------------------------------------------------

async function getActivityOptions(): Promise<string[]> {
  const res = await supabase.from('STY4dropdownoptions').select('Activities').not('Activities', 'is', null)
  return distinctTrimmed(unwrap(res) as Array<Record<string, unknown>>, 'Activities')
}
export function useGetActivityOptions() {
  return useApiFn(getActivityOptions)
}

async function getAssetOptions(): Promise<string[]> {
  const res = await supabase.from('STY4dropdownoptions').select('Assets').not('Assets', 'is', null)
  return distinctTrimmed(unwrap(res) as Array<Record<string, unknown>>, 'Assets')
}
export function useGetAssetOptions() {
  return useApiFn(getAssetOptions)
}

// Each STY4dropdownoptions row is a correlated tuple (Places, Times, Activities, Assets,
// Trade_Partners, Results, Zone) — unlike the flat single-column pulls above, this keeps the
// Asset->Place pairing so picking an asset can auto-fill its place instead of asking for both.
async function getAssetPlaceOptions(): Promise<Array<{ asset: string; place: string }>> {
  const res = await supabase.from('STY4dropdownoptions').select('Assets, Places').not('Assets', 'is', null)
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
  const res = await supabase.from('STY4dropdownoptions').select('Results').not('Results', 'is', null)
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

const CXALLOY_TABLE_PREFIX = 'STY4'
// CxAlloy's own numeric project id (not this app's Supabase data) — used only to build
// https://google.cxalloy.com/... deep links. Matches the id already hardcoded in the Apps Script.
const CXALLOY_PROJECT_ID = '50506'

export function cxAlloyChecklistUrl(checklistId: string): string {
  return `https://google.cxalloy.com/project/${CXALLOY_PROJECT_ID}/checklists/${encodeURIComponent(checklistId)}`
}
export function cxAlloyIssueUrl(issueId: string): string {
  return `https://google.cxalloy.com/project/${CXALLOY_PROJECT_ID}/constructionissue/${encodeURIComponent(issueId)}#sort%5B%5D=identified-d`
}

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
async function getChecklists(): Promise<{ rows: ChecklistRow[]; readyStatuses: string[] }> {
  const { checklistReadyStatuses: readyStatuses } = await getSettings()
  const raw = await fetchCxAlloySheet('getChecklists', { status: readyStatuses.join(',') })
  const rows: ChecklistRow[] = raw.map((r) => ({
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
  return { rows, readyStatuses }
}
export function useGetChecklists() {
  return useApiFn(getChecklists)
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
async function getIssues(): Promise<{ rows: IssueRow[]; reviewStatuses: string[] }> {
  const { issueReviewStatuses: reviewStatuses } = await getSettings()
  const raw = await fetchCxAlloySheet('getIssues', { status: reviewStatuses.join(',') })
  const rows: IssueRow[] = raw.map((r) => ({
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
  return { rows, reviewStatuses }
}
export function useGetIssues() {
  return useApiFn(getIssues)
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
// ---------------------------------------------------------------------------

export type AssetAttributeRow = Record<string, string>

async function getEquipmentAttributes(): Promise<AssetAttributeRow[]> {
  const scriptUrl = await getCxAlloyScriptUrl()
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
  const scriptUrl = await getCxAlloyScriptUrl()
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
  const scriptUrl = await getCxAlloyScriptUrl()
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
  const scriptUrl = await getCxAlloyScriptUrl()
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
// Joint Pack Photos — read from the "Joint Pack Photo - STY4A" Google Sheet (tabs: "Joint Packs",
// "Settings") via its own Apps Script web app — a separate spreadsheet from CxAlloy's, so it has
// its own script and its own URL, stored in arcapp_settings (not launchpad_projects — that row's
// google_script_url is CxAlloy's and shared with LaunchPad; this one is ArcApp-only). Photos
// themselves upload straight to Drive from that same script (DriveApp, running as the script's
// owner) into whatever folder ID is set on the Settings page, so no separate Drive connection is
// needed — see JointPackPhotoScript.gs (given to the user to deploy; not committed to this repo,
// same as CxAlloy's script isn't) for the doGet/doPost implementation.
// ---------------------------------------------------------------------------

const JOINT_PACK_SCRIPT_SETTING_KEY = 'joint_pack_script_url'

async function getJointPackScriptUrl(): Promise<string> {
  const res = await supabase.from('arcapp_settings').select('setting_value').eq('setting_key', JOINT_PACK_SCRIPT_SETTING_KEY).maybeSingle()
  if (res.error) throw new Error(res.error.message)
  const url = (res.data as { setting_value: string | null } | null)?.setting_value
  if (!url) throw new Error('Joint Pack Photo logging isn\'t wired up yet — no Apps Script URL configured.')
  return url
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
    .from('STY4BackEndData')
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
  const res = await supabase.from('STY4BackEndData').update({ result: params.result }).eq('id', params.id)
  if (res.error) throw new Error(res.error.message)
  return { id: params.id, result: params.result }
}
export function useSaveResult() {
  return useApiFn(saveResult)
}

// ---------------------------------------------------------------------------
// settings — mirrors getSettings.ts / saveSetting.ts (now backed by Supabase, not Retool DB)
// ---------------------------------------------------------------------------

export type AppSettings = {
  jointPackPhotosFolder: string
  checklistReadyStatuses: string[]
  issueReviewStatuses: string[]
  /** Assets marked "not reviewable" — excluded entirely from the Submittals page's missing-
   * coverage count (they'll never need a submittal, so they shouldn't count against the total). */
  submittalExemptAssets: string[]
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
async function getSettings(): Promise<AppSettings> {
  const res = await supabase.from('arcapp_settings').select('setting_key, setting_value')
  const rows = unwrap(res) as Array<{ setting_key: string; setting_value: string | null }>
  const map = new Map(rows.map((r) => [r.setting_key, r.setting_value ?? '']))
  return {
    jointPackPhotosFolder: map.get('joint_pack_photos_folder') ?? '',
    checklistReadyStatuses: splitCsv(map.get('checklist_ready_statuses'), SETTINGS_DEFAULTS.checklistReadyStatuses),
    issueReviewStatuses: splitCsv(map.get('issue_review_statuses'), SETTINGS_DEFAULTS.issueReviewStatuses),
    submittalExemptAssets: splitCsv(map.get('submittal_exempt_assets'), SETTINGS_DEFAULTS.submittalExemptAssets),
  }
}
export function useGetSettings() {
  return useApiFn(getSettings)
}

const ALLOWED_SETTING_KEYS = new Set([
  'joint_pack_photos_folder',
  'checklist_ready_statuses',
  'issue_review_statuses',
  'submittal_exempt_assets',
])
async function saveSetting(params: { key: string; value: string }): Promise<{ key: string; value: string }> {
  if (!ALLOWED_SETTING_KEYS.has(params.key)) throw new Error(`Unknown setting key: ${params.key}`)
  const updatedBy = (await getCurrentUserEmail()) || 'admin'
  const res = await supabase
    .from('arcapp_settings')
    .upsert(
      { setting_key: params.key, setting_value: params.value, updated_by: updatedBy, updated_at: new Date().toISOString() },
      { onConflict: 'setting_key' },
    )
  if (res.error) throw new Error(res.error.message)
  return { key: params.key, value: params.value }
}
export function useSaveSetting() {
  return useApiFn(saveSetting)
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
  const res = await supabase.from('arcapp_workflows').select('id, activities, items').order('created_at', { ascending: true, nullsFirst: false })
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

  // Reconcile by id: delete rows no longer present, then upsert the rest.
  const existingRes = await supabase.from('arcapp_workflows').select('id')
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
  const res = await supabase.from('arcapp_teams').select('id, name, members').order('name', { ascending: true })
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
    : await supabase.from('arcapp_teams').insert(record).select('id').single()
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
    : await supabase.from('arcapp_tasks').insert({ ...record, created_by: who }).select('id').single()
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
// authorized users — who may sign in to ArcApp at all (arcapp_authorized_users). Separate from
// STY4authorized_editors (edit rights) by request. The actual sign-in gate (checking a freshly
// signed-in email against this table and signing back out if absent) lives in
// src/lib/useCurrentUser.ts, not here — this section is just the admin management CRUD, editor-
// gated the same way as everything else in Settings.
// ---------------------------------------------------------------------------

export type AuthorizedUser = { id: string; email: string; name: string }

async function getAuthorizedUsers(): Promise<AuthorizedUser[]> {
  const res = await supabase.from('arcapp_authorized_users').select('id, email, name').order('email', { ascending: true })
  const rows = unwrap(res) as Array<{ id: string; email: string; name: string | null }>
  return rows.map((r) => ({ id: r.id, email: r.email, name: r.name ?? '' }))
}
export function useGetAuthorizedUsers() {
  return useApiFn(getAuthorizedUsers)
}

async function saveAuthorizedUser(params: { id?: string; email: string; name: string }): Promise<{ id: string }> {
  const email = params.email.trim().toLowerCase()
  if (!email) throw new Error('An email is required.')
  const who = (await getCurrentUserEmail()) || 'admin'

  const record = { email, name: params.name.trim(), added_by: who }
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
