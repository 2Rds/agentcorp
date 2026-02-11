/**
 * SQL validator for generated analytics queries.
 * Ensures only safe SELECT queries run against allowed tables.
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

const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE|CALL|SET|COPY|LOAD|IMPORT)\b/i;

const MAX_LIMIT = 1000;

export interface ValidationResult {
  valid: boolean;
  query: string;
  error?: string;
}

/**
 * Validate and sanitize a generated SQL query.
 * - Must be SELECT only
 * - No mutation keywords
 * - Injects organization_id filter
 * - Enforces LIMIT
 */
export function validateSQL(rawQuery: string, orgId: string): ValidationResult {
  let query = rawQuery.trim();

  // Strip markdown code fences if present
  if (query.startsWith("```")) {
    query = query.replace(/^```(?:sql)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  // Must start with SELECT (case-insensitive)
  if (!/^\s*SELECT\b/i.test(query)) {
    return { valid: false, query, error: "Only SELECT queries are allowed" };
  }

  // Check for forbidden mutation keywords
  if (FORBIDDEN_KEYWORDS.test(query)) {
    const match = query.match(FORBIDDEN_KEYWORDS);
    return { valid: false, query, error: `Forbidden keyword: ${match?.[0]}` };
  }

  // Prevent multiple statements
  const statementCount = query.split(";").filter(s => s.trim().length > 0).length;
  if (statementCount > 1) {
    return { valid: false, query, error: "Multiple statements not allowed" };
  }

  // Remove trailing semicolons
  query = query.replace(/;\s*$/, "");

  // Replace $ORG_ID placeholder with actual org ID
  query = query.replace(/\$ORG_ID/g, `'${orgId}'`);

  // If query doesn't filter by organization_id, try to inject it
  if (!query.toLowerCase().includes("organization_id")) {
    // Find the FROM clause table and add WHERE
    const fromMatch = query.match(/\bFROM\s+(\w+)/i);
    if (fromMatch) {
      const tableName = fromMatch[1];
      if (ALLOWED_TABLES.has(tableName)) {
        // Check if there's already a WHERE clause
        if (/\bWHERE\b/i.test(query)) {
          query = query.replace(/\bWHERE\b/i, `WHERE ${tableName}.organization_id = '${orgId}' AND`);
        } else {
          // Insert WHERE before GROUP BY, ORDER BY, LIMIT, or end
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
    // Ensure existing LIMIT isn't too high
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
