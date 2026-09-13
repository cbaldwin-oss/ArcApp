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
