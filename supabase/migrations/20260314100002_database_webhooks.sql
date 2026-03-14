-- Database Webhooks — fire HTTP requests on high-value table events
--
-- Uses pg_net (enabled in 20260314100001) to POST to our webhook-handler
-- Edge Function, which routes events to the appropriate agent server.
--
-- Triggers:
--   1. ea_tasks INSERT → EA agent (task processing)
--   2. agent_messages INSERT → COA agent (inter-agent message routing)
--   3. compliance_governance_log INSERT → CCA agent (audit notification)
--
-- All triggers are AFTER INSERT and fire asynchronously via pg_net.
-- The webhook-handler Edge Function returns 200 even on agent errors
-- to prevent pg_net retries for non-fatal failures.
--
-- Note: pg_net stores request/response in net._http_response (accessible
-- to postgres role). The service role key is sent in the Authorization
-- header and will be visible there. This is acceptable because:
--   1. net._http_response is only accessible to the postgres role
--   2. The key is already available via current_setting() to any
--      SECURITY DEFINER function
--   3. pg_net auto-cleans old entries

-- ─── Helper: get the webhook URL ─────────────────────────────────────────
-- We use a function so the URL can be updated without recreating triggers.
-- Set via: ALTER DATABASE postgres SET app.supabase_url = 'https://xxx.supabase.co';
-- (already set by Supabase platform automatically)

CREATE OR REPLACE FUNCTION internal_webhook_url()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    current_setting('app.supabase_url', true),
    ''
  ) || '/functions/v1/webhook-handler';
$$;

-- ─── Trigger function: generic webhook notifier ──────────────────────────

CREATE OR REPLACE FUNCTION notify_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  webhook_url text;
  service_key text;
BEGIN
  webhook_url := internal_webhook_url();
  service_key := coalesce(current_setting('supabase.service_role_key', true), '');

  -- Skip if URL or key not configured (log warning for visibility)
  IF webhook_url = '/functions/v1/webhook-handler' OR service_key = '' THEN
    RAISE WARNING '[notify_webhook] Skipping % on %: webhook URL or service key not configured',
      TG_OP, TG_TABLE_NAME;
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'record', row_to_json(NEW),
        'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- pg_net failure must never block the triggering INSERT/UPDATE
    RAISE WARNING '[notify_webhook] pg_net call failed for % on %: %',
      TG_OP, TG_TABLE_NAME, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Restrict execution to postgres role only (triggers run as table owner)
REVOKE EXECUTE ON FUNCTION notify_webhook() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION internal_webhook_url() FROM PUBLIC;

-- ─── Triggers ────────────────────────────────────────────────────────────
-- DROP IF EXISTS ensures idempotent re-runs

-- EA Tasks: notify EA agent when a new task is created
DROP TRIGGER IF EXISTS on_ea_task_inserted ON ea_tasks;
CREATE TRIGGER on_ea_task_inserted
  AFTER INSERT ON ea_tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_webhook();

-- Agent Messages: notify COA when a new inter-agent message is sent
DROP TRIGGER IF EXISTS on_agent_message_inserted ON agent_messages;
CREATE TRIGGER on_agent_message_inserted
  AFTER INSERT ON agent_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_webhook();

-- Compliance Governance Log: notify CCA on new governance events
DROP TRIGGER IF EXISTS on_governance_log_inserted ON compliance_governance_log;
CREATE TRIGGER on_governance_log_inserted
  AFTER INSERT ON compliance_governance_log
  FOR EACH ROW
  EXECUTE FUNCTION notify_webhook();
