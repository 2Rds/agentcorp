---
name: create-migration
description: Create a new Supabase migration with RLS policies following project conventions
disable-model-invocation: true
---

# Create Supabase Migration

When the user invokes `/create-migration`, scaffold a new Supabase SQL migration that follows this project's established patterns.

## Arguments

The user should provide:
- Table name(s) and column definitions
- Who should have read access (default: all org members)
- Who should have write access (default: owner and cofounder)

## Migration Pattern

Every migration in this project follows this exact structure. Apply it consistently:

### 1. Create Table

```sql
CREATE TABLE public.<table_name> (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- domain columns here
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Rules:
- Always use `UUID` primary key with `gen_random_uuid()`
- Always include `organization_id` with CASCADE delete referencing `public.organizations(id)`
- Always include `created_at` and `updated_at` timestamps
- Use `TEXT` for string columns, `NUMERIC` for money/numbers, `DATE` for dates, `TIMESTAMPTZ` for timestamps, `JSONB` for structured data
- Add inline comments for columns with constrained values (e.g., `-- founder, investor, option_pool`)

### 2. Enable RLS

```sql
ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;
```

### 3. RLS Policies

Use the project's helper functions `is_org_member()` and `has_role()` with the `app_role` enum type:

```sql
-- SELECT: org members can view
CREATE POLICY "Org members can view <table_name>"
  ON public.<table_name> FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

-- INSERT: owner/cofounder can create
CREATE POLICY "Owner/cofounder can insert <table_name>"
  ON public.<table_name> FOR INSERT
  WITH CHECK (
    is_org_member(auth.uid(), organization_id)
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'cofounder'::app_role))
  );

-- UPDATE: owner/cofounder can update
CREATE POLICY "Owner/cofounder can update <table_name>"
  ON public.<table_name> FOR UPDATE
  USING (
    is_org_member(auth.uid(), organization_id)
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'cofounder'::app_role))
  );

-- DELETE: owner/cofounder can delete
CREATE POLICY "Owner/cofounder can delete <table_name>"
  ON public.<table_name> FOR DELETE
  USING (
    is_org_member(auth.uid(), organization_id)
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'cofounder'::app_role))
  );
```

If a different role should have write access, adjust accordingly but always use `has_role(auth.uid(), '<role>'::app_role)`.

### 4. Indexes

```sql
CREATE INDEX idx_<table_name>_org ON public.<table_name>(organization_id);
```

Add additional indexes for columns used in WHERE clauses, JOINs, or unique lookups.

### 5. Updated_at Trigger

```sql
CREATE TRIGGER update_<table_name>_updated_at
  BEFORE UPDATE ON public.<table_name>
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

### 6. Optional: Realtime

Only add if the table needs live updates in the UI:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.<table_name>;
```

## Applying the Migration

Use the Supabase MCP `apply_migration` tool to apply the migration. Use a descriptive snake_case name like `create_<table_name>`.
