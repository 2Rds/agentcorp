/**
 * SQL validator for generated analytics queries.
 * Ensures only safe SELECT queries run with org-scoping, table allowlisting, and row limits.
 */

const ALLOWED_TABLES = new Set([
  "financial_model",
  "cap_table_entries",
  "knowledge_base",
  "documents",
  "investor_links",
  "link_views",
  "organizations",
]);

const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE|CALL|SET|COPY|LOAD|IMPORT|UNION|INTO|EXPLAIN|ANALYZE|VACUUM|REINDEX|CLUSTER|NOTIFY|LISTEN|MERGE|DO)\b/i;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_LIMIT = 1000;

export type ValidationResult =
  | { valid: true; query: string }
  | { valid: false; query: string; error: string };

/**
 * Validate and sanitize a generated SQL query.
 * - Must be SELECT only
 * - No mutation or dangerous keywords (including UNION, INTO, EXPLAIN)
 * - All referenced tables must be in ALLOWED_TABLES
 * - No schema-qualified table references (blocks pg_catalog, auth, etc.)
 * - Injects organization_id filter
 * - Enforces LIMIT
 */
export function validateSQL(rawQuery: string, orgId: string): ValidationResult {
  // SAFETY: orgId must be a valid UUID to prevent SQL injection via string interpolation
  if (!UUID_REGEX.test(orgId)) {
    return { valid: false, query: rawQuery, error: "Invalid organization ID format" };
  }

  let query = rawQuery.trim();

  // Strip markdown code fences if present
  if (query.startsWith("```")) {
    query = query.replace(/^```(?:sql)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  // Strip SQL comments before validation to prevent comment-based bypasses
  query = query.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();

  // Must start with SELECT (case-insensitive)
  if (!/^\s*SELECT\b/i.test(query)) {
    return { valid: false, query, error: "Only SELECT queries are allowed" };
  }

  // Check for forbidden keywords (includes UNION, INTO, EXPLAIN, etc.)
  if (FORBIDDEN_KEYWORDS.test(query)) {
    const match = query.match(FORBIDDEN_KEYWORDS);
    return { valid: false, query, error: `Forbidden keyword: ${match?.[0]}` };
  }

  // Block schema-qualified table references (e.g., pg_catalog.pg_shadow, auth.users)
  if (/\b\w+\.\w+/i.test(query.replace(/'[^']*'/g, ""))) {
    // Exclude common aliases like t.column by checking if the prefix matches a schema pattern
    const schemaRefs = query.replace(/'[^']*'/g, "").match(/\b(\w+)\.(\w+)/gi) || [];
    for (const ref of schemaRefs) {
      const schema = ref.split(".")[0].toLowerCase();
      // Allow table aliases (short names) but block known dangerous schemas and pg_ prefixes
      if (schema.startsWith("pg_") || schema === "information_schema" || schema === "auth" || schema === "public") {
        return { valid: false, query, error: `Schema-qualified reference not allowed: ${ref}` };
      }
    }
  }

  // Prevent multiple statements
  const statementCount = query.split(";").filter(s => s.trim().length > 0).length;
  if (statementCount > 1) {
    return { valid: false, query, error: "Multiple statements not allowed" };
  }

  // Remove trailing semicolons
  query = query.replace(/;\s*$/, "");

  // Extract ALL table references (FROM and JOIN clauses) and validate against allowlist
  const tableRefs = extractTableReferences(query);
  for (const table of tableRefs) {
    if (!ALLOWED_TABLES.has(table.toLowerCase())) {
      return { valid: false, query, error: `Table not allowed: ${table}. Allowed: ${[...ALLOWED_TABLES].join(", ")}` };
    }
  }

  // Replace $ORG_ID placeholder with validated org ID
  query = query.replace(/\$ORG_ID/g, `'${orgId}'`);

  // If query doesn't filter by organization_id, inject it on the primary FROM table
  if (!query.toLowerCase().includes("organization_id")) {
    const fromMatch = query.match(/\bFROM\s+(\w+)/i);
    if (fromMatch) {
      const tableName = fromMatch[1];
      if (ALLOWED_TABLES.has(tableName)) {
        if (/\bWHERE\b/i.test(query)) {
          query = query.replace(/\bWHERE\b/i, `WHERE ${tableName}.organization_id = '${orgId}' AND`);
        } else {
          const insertPoint = query.search(/\b(GROUP\s+BY|ORDER\s+BY|LIMIT|HAVING|$)/i);
          const before = query.slice(0, insertPoint).trimEnd();
          const after = query.slice(insertPoint);
          query = `${before} WHERE ${tableName}.organization_id = '${orgId}' ${after}`;
        }
      }
    }
  }

  // Enforce LIMIT
  if (!/\bLIMIT\b/i.test(query)) {
    query = `${query} LIMIT ${MAX_LIMIT}`;
  } else {
    const limitMatch = query.match(/\bLIMIT\s+(\d+)/i);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10);
      if (limit > MAX_LIMIT) {
        query = query.replace(/\bLIMIT\s+\d+/i, `LIMIT ${MAX_LIMIT}`);
      }
    }
  }

  return { valid: true, query };
}

/**
 * Extract all table names from FROM and JOIN clauses in a SQL query.
 */
function extractTableReferences(query: string): string[] {
  const tables: Set<string> = new Set();

  // Match FROM <table> and JOIN <table> patterns
  const pattern = /\b(?:FROM|JOIN)\s+(\w+)/gi;
  let match;
  while ((match = pattern.exec(query)) !== null) {
    tables.add(match[1]);
  }

  return [...tables];
}
