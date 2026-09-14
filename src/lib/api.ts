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

async function getResultOptions(): Promise<string[]> {
  const res = await supabase.from('STY4dropdownoptions').select('Results').not('Results', 'is', null)
  return distinctTrimmed(unwrap(res) as Array<Record<string, unknown>>, 'Results')
}
export function useGetResultOptions() {
  return useApiFn(getResultOptions)
}

// ---------------------------------------------------------------------------
// checklists / issues — these read from a Google Sheet in the original app, not Supabase.
// Porting that integration is out of scope here; wire up your own Google Sheets API client
// (a service account + `googleapis`, or a Supabase Edge Function) and replace these two bodies.
// ---------------------------------------------------------------------------

export type ChecklistRow = {
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
  throw new Error(
    'Checklists come from a Google Sheet in the original app (STY4A API Database). ' +
      'Wire up a Google Sheets API client here — see README "Known gaps".',
  )
}
export function useGetChecklists() {
  return useApiFn(getChecklists)
}

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
  throw new Error(
    'Issues come from a Google Sheet in the original app (STY4A API Database). ' +
      'Wire up a Google Sheets API client here — see README "Known gaps".',
  )
}
export function useGetIssues() {
  return useApiFn(getIssues)
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
}
const SETTINGS_DEFAULTS = {
  checklistReadyStatuses: ['Finished'],
  issueReviewStatuses: ['Pending Verification'],
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
  }
}
export function useGetSettings() {
  return useApiFn(getSettings)
}

const ALLOWED_SETTING_KEYS = new Set(['joint_pack_photos_folder', 'checklist_ready_statuses', 'issue_review_statuses'])
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
// submittals — mirrors getSubmittals.ts / saveSubmittal.ts
// ---------------------------------------------------------------------------

export type SubmittalRow = {
  asset_name: string
  notes: string
  review_status: string
  updated_by: string
  updated_at: string
}
async function getSubmittals(): Promise<SubmittalRow[]> {
  const res = await supabase.from('STY4Submittals').select('asset_name, notes, review_status, updated_by, updated_at')
  const rows = unwrap(res) as SubmittalRow[]
  return rows.map((r) => ({
    asset_name: r.asset_name || '',
    notes: r.notes || '',
    review_status: r.review_status || '',
    updated_by: r.updated_by || '',
    updated_at: r.updated_at || '',
  }))
}
export function useGetSubmittals() {
  return useApiFn(getSubmittals)
}

const ALLOWED_SUBMITTAL_STATUSES = new Set(['', 'Not Started', 'In Review', 'Approved', 'Rejected'])
async function saveSubmittal(params: { asset_name: string; notes: string; review_status: string }): Promise<{ asset_name: string }> {
  if (!params.asset_name) throw new Error('asset_name is required')
  if (!ALLOWED_SUBMITTAL_STATUSES.has(params.review_status)) throw new Error(`Invalid review status: ${params.review_status}`)
  const updatedBy = await getCurrentUserEmail()
  const res = await supabase.from('STY4Submittals').upsert(
    {
      asset_name: params.asset_name,
      notes: params.notes || '',
      review_status: params.review_status || '',
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'asset_name' },
  )
  if (res.error) throw new Error(res.error.message)
  return { asset_name: params.asset_name }
}
export function useSaveSubmittal() {
  return useApiFn(saveSubmittal)
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

/**
 * Updates one catalog row. Only the presentation/availability fields are writable here — the
 * `config` payload that defines an item's behavior gets its own editor once those are specified.
 */
async function saveWorkflowItem(params: {
  key: string
  label?: string
  description?: string
  enabled?: boolean
  sortOrder?: number
}): Promise<{ key: string }> {
  const key = (params.key ?? '').trim()
  if (!key) throw new Error('An item key is required.')
  const updatedBy = (await getCurrentUserEmail()) || 'admin'

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: updatedBy }
  if (params.label !== undefined) patch.label = params.label.trim()
  if (params.description !== undefined) patch.description = params.description
  if (params.enabled !== undefined) patch.enabled = params.enabled
  if (params.sortOrder !== undefined) patch.sort_order = params.sortOrder

  const res = await supabase.from('arcapp_workflow_items').update(patch).eq('item_key', key)
  if (res.error) throw new Error(res.error.message)
  return { key }
}
export function useSaveWorkflowItem() {
  return useApiFn(saveWorkflowItem)
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
