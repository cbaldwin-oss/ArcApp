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

-- ---------------------------------------------------------------------------
-- NOT YET APPLIED — Teams + Tasks (To-Do assignment tool, requested 2026-09-18).
--
-- `members` is a jsonb array of {"name": "...", "email": "..."} objects, same style as
-- arcapp_workflows.items — a team's roster is small, so a join table would be overkill.
--
-- A task is assigned to at most one of: a team (assigned_team_id) or a specific person
-- (assigned_email/assigned_name) — the app enforces that, not a DB constraint, since "neither"
-- (unassigned) is also valid. Deleting a team the app-layer way just unassigns its tasks
-- (ON DELETE SET NULL) rather than deleting them.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS arcapp_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  members jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS arcapp_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  tag text NOT NULL DEFAULT 'norm', -- 'crit' | 'high' | 'norm'
  sys text NOT NULL DEFAULT '',
  due_date date,
  done boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  assigned_team_id uuid REFERENCES arcapp_teams(id) ON DELETE SET NULL,
  assigned_email text,
  assigned_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_by text
);

-- Seed: carry over the old hardcoded sample To-Dos as real rows, so the list isn't empty on
-- first load. Only runs if arcapp_tasks is completely empty (no unique column to ON CONFLICT on
-- otherwise), so it's safe to re-run without creating duplicates.
INSERT INTO arcapp_tasks (text, tag, sys, due_date, done, completed_at)
SELECT * FROM (VALUES
  ('Approve turnover package — Chiller Plant Room 1',                'crit', 'CHW-01', CURRENT_DATE,     false, NULL::timestamptz),
  ('Review LOTO permit request — MC-204 Switchgear',                 'high', 'MC-204', CURRENT_DATE,     false, NULL::timestamptz),
  ('Walk punch list — Electrical Room 3',                            'norm', 'ER-03',  CURRENT_DATE + 1, false, NULL::timestamptz),
  ('Sign off functional test — Fire Alarm Panel FP-2',               'high', 'FP-2',   CURRENT_DATE + 5, false, NULL::timestamptz),
  ('Update RFSU tracker — BAS Integration',                          'norm', 'BAS-01', CURRENT_DATE + 8, false, NULL::timestamptz),
  ('Coordinate vendor start-up — Generator Load Bank Test',          'crit', 'GEN-02', CURRENT_DATE + 9, false, NULL::timestamptz),
  ('Close out punch items — Domestic Water Booster',                 'norm', 'DWB-01', CURRENT_DATE + 6, false, NULL::timestamptz),
  ('File inspection request — Emergency Lighting circuit EL-14',     'norm', 'EL-14',  CURRENT_DATE - 4, true,  now())
) AS seed(text, tag, sys, due_date, done, completed_at)
WHERE NOT EXISTS (SELECT 1 FROM arcapp_tasks);

-- ---------------------------------------------------------------------------
-- NOT YET APPLIED — arcapp_authorized_users (requested 2026-09-18).
--
-- A dedicated, separate allowlist for who may actually SIGN IN to ArcApp at all — deliberately
-- not the same table as STY4authorized_editors (which governs edit rights and is shared with
-- other apps). Someone can be an authorized_user without being an editor, or vice versa.
--
-- The sign-in gate itself lives in src/lib/useCurrentUser.ts: after any successful auth (Google
-- or magic-link), it checks the signed-in email against this table and immediately signs back out
-- anyone not on it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS arcapp_authorized_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  added_by text
);

-- Seed from STY4authorized_editors so turning this gate on doesn't lock out everyone who
-- currently has edit rights — review/prune the list from Settings afterward. ON CONFLICT DO
-- NOTHING makes this safe to re-run.
INSERT INTO arcapp_authorized_users (email, added_by)
SELECT DISTINCT lower(email), 'migration (seeded from STY4authorized_editors)'
FROM "STY4authorized_editors"
WHERE email IS NOT NULL AND email <> ''
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------------
-- NOT YET APPLIED — arcapp_submittals (requested 2026-09-19).
--
-- Replaces the old STY4Submittals-backed reviewer, which was one row per ASSET. A submittal is
-- now its own record — a title + an uploaded file — that applies to a whole SET of assets at
-- once (`assets`, a jsonb array of asset names). Its `review_status`/`notes` apply to every asset
-- in that array simultaneously, since they all share this one row instead of each having their
-- own — that's the whole point, not extra logic layered on top.
--
-- Files upload to the "submittals" Supabase Storage bucket (created below, public read so links
-- work for anyone; writes are editor-gated — see supabase/policies.sql).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS arcapp_submittals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  file_url text,
  file_name text,
  assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_status text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO storage.buckets (id, name, public)
SELECT 'submittals', 'submittals', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'submittals');
