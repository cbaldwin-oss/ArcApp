-- =============================================================================
-- ALREADY APPLIED to your Supabase project as part of this migration.
-- Kept here so it's versioned and re-runnable (each CREATE POLICY will error if
-- the policy already exists — drop it first if you need to redefine one).
-- =============================================================================

-- APPLIED 2026-09-24, fixing a real outage: every "authorized/admin" write policy below was
-- originally written as a raw `EXISTS (SELECT 1 FROM arcapp_authorized_users a WHERE ...)`
-- subquery. The very first real Google OAuth sign-in hit
-- `infinite recursion detected in policy for relation "arcapp_authorized_users"` — because
-- Postgres re-applies arcapp_authorized_users' own RLS policies every time ANY policy's subquery
-- selects from that table, including a subquery inside arcapp_authorized_users' own policy, which
-- recurses forever. This wasn't caught by this repo's Playwright sign-in tests because those mock
-- the Supabase REST layer entirely and never exercise real Postgres RLS evaluation.
--
-- Fix: two SECURITY DEFINER functions. SECURITY DEFINER runs as the function's owner (a role with
-- table access), bypassing RLS *inside* the function body, so the lookup no longer re-triggers the
-- calling policy. Every policy that used to inline the subquery now calls one of these instead.
CREATE OR REPLACE FUNCTION is_arcapp_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM arcapp_authorized_users a WHERE lower(a.email) = lower(auth.jwt() ->> 'email') AND a.role = 'admin') $$;

CREATE OR REPLACE FUNCTION is_arcapp_authorized() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM arcapp_authorized_users a WHERE lower(a.email) = lower(auth.jwt() ->> 'email')) $$;

GRANT EXECUTE ON FUNCTION is_arcapp_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_arcapp_authorized() TO authenticated, anon;

ALTER TABLE arcapp_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcapp_settings ENABLE ROW LEVEL SECURITY;

-- Read is public (found missing `anon` 2026-09-19, fixed same week — was breaking Joint Pack
-- Photos' Drive-folder/script-URL lookup, the Checklists/Issues ready-status filters, and the
-- Submittals missing-count/exempt-assets list for every not-signed-in user).
CREATE POLICY "settings_select_public" ON arcapp_settings
  FOR SELECT TO anon, authenticated USING (true);

-- TEMPORARY (requested 2026-09-14, widened same day): NO sign-in required at all to
-- read/create/edit/delete Workflows — `anon` and `authenticated` both allowed. Matches the
-- app-side relaxation in Dashboard.tsx (`canManageWorkflows`, now hardcoded `true`).
-- To revert: drop these two policies and re-create the editor-restricted versions below (kept
-- here for exactly that purpose), then flip `canManageWorkflows` back to `canEdit` in Dashboard.tsx.
CREATE POLICY "workflows_select_public" ON arcapp_workflows
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "workflows_write_public" ON arcapp_workflows
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
-- Editor-restricted version this replaced — the "arcapp_workflow_items" catalog below still uses
-- this same read-open/write-authorized pattern, unchanged:
-- CREATE POLICY "workflows_select_authenticated" ON arcapp_workflows
--   FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "workflows_write_authorized" ON arcapp_workflows
--   FOR ALL TO authenticated
--   USING (EXISTS (SELECT 1 FROM arcapp_authorized_users a WHERE lower(a.email) = lower(auth.jwt() ->> 'email')))
--   WITH CHECK (EXISTS (SELECT 1 FROM arcapp_authorized_users a WHERE lower(a.email) = lower(auth.jwt() ->> 'email')));

-- Settings specifically requires role = 'admin', not just any authorized user — "editors cannot
-- adjust settings" (requested 2026-09-24). Was `STY4authorized_editors`-based ("*_write_editors")
-- until the same date, when ArcApp's whole permission model moved to its own table — see
-- arcapp_authorized_users below.
CREATE POLICY "settings_write_admins" ON arcapp_settings
  FOR ALL TO authenticated
  USING (is_arcapp_admin())
  WITH CHECK (is_arcapp_admin());



-- =============================================================================
-- ALREADY APPLIED. Read is public (`anon` included) so the New Workflow form's item
-- checklist works with no sign-in, matching arcapp_workflows above. Writing to the catalog
-- itself (add/rename/retire an item) stays authorized-only — that wasn't part of the "no sign-in"
-- request, only building workflows was. (Any authorized user, admin or editor — the item catalog
-- isn't Settings, so it doesn't need the narrower admin-only check that table gets.)
-- =============================================================================

ALTER TABLE arcapp_workflow_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_items_select_public" ON arcapp_workflow_items
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "workflow_items_write_authorized" ON arcapp_workflow_items
  FOR ALL TO authenticated
  USING (is_arcapp_authorized())
  WITH CHECK (is_arcapp_authorized());


-- =============================================================================
-- NOT YET APPLIED — recommended, but left for you to review and run yourself.
--
-- Inside Retool, every query ran through a privileged connection, so table-level
-- RLS on these existing tables didn't matter much. Once this app ships as public
-- JS talking to Supabase with the anon key, that changes:
--
--   - STY4Assets, STY4BackEndData, STY4authorized_editors, STY4dropdownoptions
--     already have RLS ENABLED in your project. This app assumes their existing
--     policies allow `authenticated` users to read/write appropriately — check
--     them in the Supabase dashboard (Auth -> Policies) before going live, since
--     this app didn't create them and doesn't know their exact shape.
--
--   - STY4RTFT and STY4Submittals currently have RLS DISABLED, which means with
--     RLS off, ANY holder of the anon key (i.e. anyone who opens this site) can
--     read and write those tables without restriction. That's very likely not
--     what you want for RTFT inspection records or submittal reviews.
--
-- We didn't flip these on for you because another app (LaunchPad) reads/writes
-- the same database, and we don't know what that app currently expects from
-- these two tables' access. Enabling RLS with no matching policy would silently
-- break it. Review with whoever owns LaunchPad, then run something like:
-- =============================================================================

-- ALTER TABLE "STY4RTFT" ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "rtft_select_authenticated" ON "STY4RTFT" FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "rtft_write_editors" ON "STY4RTFT" FOR ALL TO authenticated
--   USING (EXISTS (SELECT 1 FROM "STY4authorized_editors" e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')))
--   WITH CHECK (EXISTS (SELECT 1 FROM "STY4authorized_editors" e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')));

-- ALTER TABLE "STY4Submittals" ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "submittals_select_authenticated" ON "STY4Submittals" FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "submittals_write_editors" ON "STY4Submittals" FOR ALL TO authenticated
--   USING (EXISTS (SELECT 1 FROM "STY4authorized_editors" e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')))
--   WITH CHECK (EXISTS (SELECT 1 FROM "STY4authorized_editors" e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')));


-- =============================================================================
-- NOT YET APPLIED — arcapp_teams / arcapp_tasks (To-Do assignment tool). Wide open
-- (anon + authenticated, no editor check) by request, same shape as arcapp_workflows —
-- anyone can build teams and create/assign/complete/delete tasks without signing in.
-- =============================================================================

ALTER TABLE arcapp_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcapp_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_select_public" ON arcapp_teams
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "teams_write_public" ON arcapp_teams
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "tasks_select_public" ON arcapp_tasks
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tasks_write_public" ON arcapp_tasks
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- APPLIED — arcapp_authorized_users (sign-in gate + roles). Deliberately NOT wide open like the
-- tables above — this IS the access control list, and as of 2026-09-24 it's ArcApp's ENTIRE
-- permission model (see schema.sql for the role column and CHECK constraint).
--
-- Read is scoped to your OWN row only (lower(email) = your JWT's email) — the app only ever
-- needs to check "is *I* on this list, and what's my role", never enumerate who else is, so no
-- anon read at all and no way for a signed-in user to see the whole roster. Admins additionally
-- get full read+write (for the management UI in Settings) via the second, ALL-scoped policy —
-- Postgres RLS ORs multiple permissive policies for the same command together, so both apply at
-- once. This checks THIS table to decide who can write to THIS table rather than deferring to
-- STY4authorized_editors — by explicit request, so ArcApp's access control has no dependency on
-- LaunchPad's shared table at all, in either direction. The write policy goes through
-- is_arcapp_admin() (see top of file) rather than an inline subquery, specifically because a
-- same-table subquery here recurses infinitely — this table is the one that surfaced the bug.
-- =============================================================================

ALTER TABLE arcapp_authorized_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authorized_users_select_own" ON arcapp_authorized_users
  FOR SELECT TO authenticated
  USING (lower(email) = lower(auth.jwt() ->> 'email'));

CREATE POLICY "authorized_users_write_admins" ON arcapp_authorized_users
  FOR ALL TO authenticated
  USING (is_arcapp_admin())
  WITH CHECK (is_arcapp_admin());


-- =============================================================================
-- APPLIED — arcapp_submittals (requested 2026-09-19). Viewable without signing in (matches
-- Checklists/Issues/Joint Pack Photos — status is useful to anyone on-site), writes require any
-- authorized ArcApp user (admin or editor — Submittals isn't Settings, so no admin-only check).
-- =============================================================================

ALTER TABLE arcapp_submittals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "submittals_select_public" ON arcapp_submittals
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "submittals_write_authorized" ON arcapp_submittals
  FOR ALL TO authenticated
  USING (is_arcapp_authorized())
  WITH CHECK (is_arcapp_authorized());

-- Storage: the "submittals" bucket (created in schema.sql) is a PUBLIC bucket, so reading an
-- uploaded file's public URL needs no policy at all — but writes to storage.objects always need
-- one regardless of bucket visibility, or every upload gets rejected.
CREATE POLICY "submittals_bucket_insert_authorized" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'submittals' AND is_arcapp_authorized());

CREATE POLICY "submittals_bucket_update_authorized" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'submittals' AND is_arcapp_authorized());

CREATE POLICY "submittals_bucket_delete_authorized" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'submittals' AND is_arcapp_authorized());


-- =============================================================================
-- NOT YET APPLIED — arcapp_item_assignments (Checklist/Issue To-Do, requested 2026-09-21).
-- Same wide-open pattern as arcapp_teams/arcapp_tasks above — this is the same assignment
-- system extended to cover CxAlloy checklist/issue items instead of freeform tasks, so it gets
-- the same "anyone on-site can reassign, no sign-in required" access.
-- =============================================================================

ALTER TABLE arcapp_item_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_assignments_select_public" ON arcapp_item_assignments
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "item_assignments_write_public" ON arcapp_item_assignments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- APPLIED — SAN-NT1B project switcher's `project_key` columns (see schema.sql). No new policies
-- needed: every existing policy on arcapp_settings/tasks/teams/submittals/workflows/
-- item_assignments already grants access with `USING (true)` (or an editor check that doesn't
-- reference any column value) — none of them restrict by column, so adding project_key doesn't
-- change what a policy allows. Isolation between projects is enforced entirely app-side, by every
-- query in src/lib/api.ts filtering/stamping `.eq('project_key', CURRENT_PROJECT)` — same as how
-- this app was already trusting itself (not RLS) to keep e.g. one submittal's assets list correct.
-- =============================================================================
