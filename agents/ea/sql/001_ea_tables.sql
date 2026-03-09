-- ─── EA Agent Tables ──────────────────────────────────────────────────────────
-- Executive Assistant domain tables for task management, meeting notes,
-- and communications logging. All tables are org-scoped via organization_id.

-- ─── Tasks ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ea_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  due_date DATE,
  assigned_to TEXT,
  created_by TEXT NOT NULL DEFAULT 'alex-ea',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ea_tasks_org ON ea_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_ea_tasks_status ON ea_tasks(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_ea_tasks_priority ON ea_tasks(organization_id, priority);
CREATE INDEX IF NOT EXISTS idx_ea_tasks_due ON ea_tasks(organization_id, due_date) WHERE due_date IS NOT NULL;

-- ─── Meeting Notes ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ea_meeting_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  attendees TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL,
  action_items JSONB NOT NULL DEFAULT '[]',
  key_decisions TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ea_meetings_org ON ea_meeting_notes(organization_id);
CREATE INDEX IF NOT EXISTS idx_ea_meetings_date ON ea_meeting_notes(organization_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ea_meetings_attendees ON ea_meeting_notes USING GIN (attendees);

-- ─── Communications Log ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ea_communications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  type TEXT NOT NULL
    CHECK (type IN ('email_draft', 'slack_summary', 'cross_dept', 'external')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  recipients TEXT[] DEFAULT '{}',
  sender TEXT NOT NULL DEFAULT 'Alex (EA)',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'archived')),
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ea_comms_org ON ea_communications_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_ea_comms_type ON ea_communications_log(organization_id, type);
CREATE INDEX IF NOT EXISTS idx_ea_comms_status ON ea_communications_log(organization_id, status);

-- ─── Auto-update trigger for ea_tasks.updated_at ─────────────────────────────

CREATE OR REPLACE FUNCTION update_ea_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ea_tasks_updated_at ON ea_tasks;
CREATE TRIGGER trg_ea_tasks_updated_at
  BEFORE UPDATE ON ea_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_ea_tasks_updated_at();

-- ─── RLS Policies ────────────────────────────────────────────────────────────
-- Service role (agent) bypasses RLS. These policies protect against
-- direct client access if tables are ever exposed.

ALTER TABLE ea_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ea_meeting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ea_communications_log ENABLE ROW LEVEL SECURITY;

-- Service role bypass (agent uses service role key)
CREATE POLICY ea_tasks_service ON ea_tasks FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY ea_meetings_service ON ea_meeting_notes FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY ea_comms_service ON ea_communications_log FOR ALL
  USING (true) WITH CHECK (true);
