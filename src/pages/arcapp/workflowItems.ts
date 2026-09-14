/**
 * The catalog of workflow items (the on-site modules a workflow can include).
 *
 * The source of truth is the `arcapp_workflow_items` table in Supabase — see
 * supabase/schema.sql. Each row there will eventually carry the definition of what the item
 * actually does (`config` jsonb); for now the table holds key/label/description/order so admins
 * can add or retire items without a code change.
 *
 * The list below is only a fallback used when that table can't be read (e.g. the migration hasn't
 * been run yet) so the Workflows builder and the activity drawer keep working. `key` values are
 * stable identifiers stored inside `arcapp_workflows.items` — never rename one, only its label.
 */

export type WorkflowItem = {
  key: string
  label: string
  description: string
  sortOrder: number
  enabled: boolean
}

export const FALLBACK_WORKFLOW_ITEMS: WorkflowItem[] = [
  { key: 'late_time_personnel', label: 'Late Time/Personnel', description: 'Hours between scheduled and actual start, plus corrective-action headcount.', sortOrder: 10, enabled: true },
  { key: 'tamper_seal', label: 'Tamper Seal Logging', description: 'Log seal numbers, locations, and condition against the asset.', sortOrder: 20, enabled: true },
  { key: 'joint_pack_photos', label: 'Joint Pack Photos', description: 'File joint pack photos to the Activity → Asset → Date folder chain.', sortOrder: 30, enabled: true },
  { key: 'equipment_photos', label: 'Equipment Photos', description: 'Capture general equipment photos for the activity.', sortOrder: 40, enabled: true },
  { key: 'rtft', label: 'RTFT Logging', description: 'Ready to Fill/Turnover inspection record.', sortOrder: 50, enabled: true },
  { key: 'cmms_data_collection', label: 'CMMS Data Collection', description: 'Equipment ID, work order number, and CMMS notes.', sortOrder: 70, enabled: true },
  { key: 'scaaf_study', label: 'SCAAF Study Information', description: 'SCAAF study data captured against the activity.', sortOrder: 80, enabled: true },
]

/** key → label lookup, tolerant of keys that are no longer in the catalog. */
export function itemLabels(items: WorkflowItem[]): Record<string, string> {
  return Object.fromEntries(items.map((i) => [i.key, i.label]))
}
