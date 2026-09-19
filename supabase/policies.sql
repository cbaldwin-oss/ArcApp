-- =============================================================================
-- ALREADY APPLIED to your Supabase project as part of this migration.
-- Kept here so it's versioned and re-runnable (each CREATE POLICY will error if
-- the policy already exists — drop it first if you need to redefine one).
-- =============================================================================

ALTER TABLE arcapp_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcapp_settings ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can read app config (settings).
CREATE POLICY "settings_select_authenticated" ON arcapp_settings
  FOR SELECT TO authenticated USING (true);

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
-- Editor-restricted versions this replaced — the "arcapp_workflow_items" catalog below still
-- uses this same read-open/write-editors pattern, unchanged:
-- CREATE POLICY "workflows_select_authenticated" ON arcapp_workflows
--   FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "workflows_write_editors" ON arcapp_workflows
--   FOR ALL TO authenticated
--   USING (EXISTS (SELECT 1 FROM "STY4authorized_editors" e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')))
--   WITH CHECK (EXISTS (SELECT 1 FROM "STY4authorized_editors" e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')));

CREATE POLICY "settings_write_editors" ON arcapp_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "STY4authorized_editors" e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM "STY4authorized_editors" e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')));



-- =============================================================================
-- ALREADY APPLIED. Read is public (`anon` included) so the New Workflow form's item
-- checklist works with no sign-in, matching arcapp_workflows above. Writing to the catalog
-- itself (add/rename/retire an item) stays editor-only — that wasn't part of the "no sign-in"
-- request, only building workflows was.
-- =============================================================================

ALTER TABLE arcapp_workflow_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_items_select_public" ON arcapp_workflow_items
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "workflow_items_write_editors" ON arcapp_workflow_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "STY4authorized_editors" e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM "STY4authorized_editors" e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')));


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
