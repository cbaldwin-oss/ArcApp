-- Already run against your Supabase project (cbaldwin-oss's Project) as part of this migration.
-- Kept here so the schema is versioned alongside the app. Safe to re-run (idempotent).

CREATE TABLE IF NOT EXISTS arcapp_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activities jsonb NOT NULL DEFAULT '[]'::jsonb,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS arcapp_settings (
  setting_key text PRIMARY KEY,
  setting_value text,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- NOT YET APPLIED — run this one against your project.
--
-- The catalog of workflow items (the on-site modules a workflow can include). `item_key` values
-- are what get stored inside arcapp_workflows.items, so they are stable identifiers: change a
-- label freely, never an existing key.
--
-- `config` is the placeholder for the per-item definition of what the item should actually do
-- (which fields to show, where the answers get written, etc.). It's an empty object for now — the
-- app reads key/label/description/sort_order/enabled and ignores config until those behaviors are
-- specified. Retire an item by setting enabled = false: it disappears from the builder's picker
-- but workflows that already reference it keep rendering.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS arcapp_workflow_items (
  item_key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- Seed the eight items. ON CONFLICT DO NOTHING so re-running never clobbers edits made in the
-- dashboard. The first three, plus rtft/launchpad_status/cmms_data_collection, keep the keys the
-- pre-existing workflows already store; equipment_photos and scaaf_study are new.
INSERT INTO arcapp_workflow_items (item_key, label, description, sort_order) VALUES
  ('late_time_personnel',  'Late Time/Personnel',        'Hours between scheduled and actual start, plus corrective-action headcount.', 10),
  ('tamper_seal',          'Tamper Seal Logging',        'Log seal numbers, locations, and condition against the asset.',               20),
  ('joint_pack_photos',    'Joint Pack Photos',          'File joint pack photos to the Activity → Asset → Date folder chain.',         30),
  ('equipment_photos',     'Equipment Photos',           'Capture general equipment photos for the activity.',                          40),
  ('rtft',                 'RTFT Logging',               'Ready to Fill/Turnover inspection record.',                                   50),
  ('launchpad_status',     'LaunchPad Result Logging',   'Schedule status and notes pushed back to LaunchPad.',                         60),
  ('cmms_data_collection', 'CMMS Data Collection',       'Equipment ID, work order number, and CMMS notes.',                            70),
  ('scaaf_study',          'SCAAF Study Information',    'SCAAF study data captured against the activity.',                             80)
ON CONFLICT (item_key) DO NOTHING;
