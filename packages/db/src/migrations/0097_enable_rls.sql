-- Security hardening: enable Row Level Security (deny-all, no policies) on all
-- public tables. Rationale: managed Postgres hosts (e.g. Supabase) auto-expose
-- public tables via a REST API to anon/authenticated roles. This app does NOT
-- use that API or those roles — the browser talks only to the Express API, which
-- enforces auth (better-auth + assertAuthenticated/assertCompanyAccess), and the
-- app connects as a BYPASSRLS owner role. So enabling RLS with NO policies blocks
-- the public API entirely while leaving the application unaffected.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;
--> statement-breakpoint
-- Auto-enable RLS on any future public table so new tables are never accidentally
-- exposed via the host's auto API.
CREATE OR REPLACE FUNCTION public.auto_enable_rls()
RETURNS event_trigger LANGUAGE plpgsql AS $fn$
DECLARE obj RECORD;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
             WHERE object_type = 'table' AND schema_name = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY;', obj.object_identity);
  END LOOP;
END
$fn$;
--> statement-breakpoint
DROP EVENT TRIGGER IF EXISTS auto_enable_rls_trigger;
--> statement-breakpoint
CREATE EVENT TRIGGER auto_enable_rls_trigger
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE')
  EXECUTE FUNCTION public.auto_enable_rls();
