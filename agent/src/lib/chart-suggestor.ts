/**
 * Infers the best chart type from query result data shape.
 * Returns a ChartConfig that the frontend DynamicChart component can render.
 */

export interface ChartConfig {
  type: "line" | "bar" | "area" | "pie" | "kpi";
  title: string;
  data: Record<string, unknown>[];
  xKey?: string;
  yKeys?: string[];
  colors?: string[];
}

// Common date/time column patterns
const TIME_PATTERNS = /^(month|date|period|year|quarter|week|day|created_at|updated_at|timestamp)$/i;
const LABEL_PATTERNS = /^(name|category|subcategory|type|label|stakeholder|round|source|status)$/i;

/**
 * Suggest the best chart configuration based on query results.
 */
export function suggestChart(
  data: Record<string, unknown>[],
  question: string
): ChartConfig {
  if (!data || data.length === 0) {
    return { type: "kpi", title: "No Data", data: [] };
  }

  const columns = Object.keys(data[0]);

  // Single value → KPI card
  if (data.length === 1 && columns.length <= 2) {
    const numericCols = columns.filter(c => typeof data[0][c] === "number");
    if (numericCols.length >= 1) {
      return {
        type: "kpi",
        title: question.slice(0, 60),
        data,
      };
    }
  }

  // Find time column and label column
  const timeCol = columns.find(c => TIME_PATTERNS.test(c));
  const labelCol = columns.find(c => LABEL_PATTERNS.test(c));
  const numericCols = columns.filter(c => {
    if (TIME_PATTERNS.test(c) || LABEL_PATTERNS.test(c)) return false;
    // Check if most values are numeric
    const numericCount = data.filter(row => typeof row[c] === "number").length;
    return numericCount > data.length * 0.5;
  });

  // Time series data → Line or Area chart
  if (timeCol && numericCols.length > 0) {
    const chartType = numericCols.length === 1 ? "area" : "line";
    return {
      type: chartType,
      title: question.slice(0, 60),
      data,
      xKey: timeCol,
      yKeys: numericCols.slice(0, 5),
      colors: DEFAULT_COLORS.slice(0, numericCols.length),
    };
  }

  // Category breakdown → Bar chart (default) or Pie (few categories)
  if (labelCol && numericCols.length > 0) {
    const chartType = data.length <= 6 && numericCols.length === 1 ? "pie" : "bar";
    return {
      type: chartType,
      title: question.slice(0, 60),
      data,
      xKey: labelCol,
      yKeys: numericCols.slice(0, 5),
      colors: DEFAULT_COLORS.slice(0, numericCols.length),
    };
  }

  // Fallback: if we have any numeric columns, make a bar chart
  if (numericCols.length > 0) {
    const xKey = columns.find(c => !numericCols.includes(c)) ?? columns[0];
    return {
      type: "bar",
      title: question.slice(0, 60),
      data,
      xKey,
      yKeys: numericCols.slice(0, 5),
      colors: DEFAULT_COLORS.slice(0, numericCols.length),
    };
  }

  // No numeric columns — just return data as KPI
  return {
    type: "kpi",
    title: question.slice(0, 60),
    data,
  };
}

const DEFAULT_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];
