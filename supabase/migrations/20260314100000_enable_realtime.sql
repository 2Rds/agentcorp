-- Enable Supabase Realtime for workspace tables
-- Agents write to these tables; frontend subscribes for live updates.
-- Each table is added to the supabase_realtime publication so
-- postgres_changes events are broadcast to connected clients.
--
-- Wrapped in DO blocks to make idempotent — ALTER PUBLICATION ADD TABLE
-- fails if the table is already in the publication.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'agent_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE agent_messages;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'agent_usage_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE agent_usage_events;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'coa_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE coa_tasks;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'coa_processes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE coa_processes;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'coa_communications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE coa_communications;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ea_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ea_tasks;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ea_meeting_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ea_meeting_notes;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ea_communications_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ea_communications_log;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cma_content_drafts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cma_content_drafts;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cma_campaigns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cma_campaigns;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'compliance_policy_register'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE compliance_policy_register;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'compliance_risk_assessments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE compliance_risk_assessments;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'compliance_governance_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE compliance_governance_log;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'legal_reviews'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE legal_reviews;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'legal_ip_portfolio'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE legal_ip_portfolio;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sales_pipeline'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sales_pipeline;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sales_call_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sales_call_logs;
  END IF;
END $$;
