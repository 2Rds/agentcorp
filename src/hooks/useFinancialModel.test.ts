import { describe, it, expect } from "vitest";
import { computeDerivedMetrics, type FinancialModelRow } from "./useFinancialModel";

function makeRow(overrides: Partial<FinancialModelRow> = {}): FinancialModelRow {
  return {
    id: "1",
    organization_id: "org-1",
    category: "revenue",
    subcategory: "saas",
    month: "2026-01",
    amount: 0,
    formula: null,
    scenario: "base",
    ...overrides,
  };
}

describe("computeDerivedMetrics", () => {
  it("returns zero defaults for empty rows", () => {
    const result = computeDerivedMetrics([]);
    expect(result.monthlyBurn).toBe(0);
    expect(result.runway).toBe(0);
    expect(result.totalFunding).toBe(0);
    expect(result.mrr).toBe(0);
    expect(result.grossMargin).toBe(0);
    expect(result.monthlyData).toHaveLength(0);
  });

  it("computes monthly burn from negative EBITDA", () => {
    const rows: FinancialModelRow[] = [
      makeRow({ category: "revenue", amount: 10000, month: "2026-01" }),
      makeRow({ category: "opex", subcategory: "salaries", amount: 15000, month: "2026-01" }),
    ];
    const result = computeDerivedMetrics(rows);
    // Revenue 10k, opex 15k → EBITDA -5k → burn 5k
    expect(result.monthlyBurn).toBe(5000);
  });

  it("computes zero burn when profitable", () => {
    const rows: FinancialModelRow[] = [
      makeRow({ category: "revenue", amount: 20000, month: "2026-01" }),
      makeRow({ category: "opex", subcategory: "salaries", amount: 5000, month: "2026-01" }),
    ];
    const result = computeDerivedMetrics(rows);
    expect(result.monthlyBurn).toBe(0);
  });

  it("computes runway from funding and burn", () => {
    const rows: FinancialModelRow[] = [
      makeRow({ category: "revenue", amount: 5000, month: "2026-01" }),
      makeRow({ category: "opex", subcategory: "salaries", amount: 10000, month: "2026-01" }),
      makeRow({ category: "funding", subcategory: "seed", amount: 500000, month: "2026-01" }),
    ];
    const result = computeDerivedMetrics(rows);
    // Burn = 5000, funding = 500000, cash = -5000 + 500000 = 495000
    // Runway = 495000 / 5000 = 99
    expect(result.monthlyBurn).toBe(5000);
    expect(result.totalFunding).toBe(500000);
    expect(result.runway).toBe(99);
  });

  it("computes gross margin correctly", () => {
    const rows: FinancialModelRow[] = [
      makeRow({ category: "revenue", amount: 100000, month: "2026-01" }),
      makeRow({ category: "cogs", subcategory: "hosting", amount: 20000, month: "2026-01" }),
    ];
    const result = computeDerivedMetrics(rows);
    // Gross profit = 80000, margin = 80%
    expect(result.grossMargin).toBe(80);
    expect(result.mrr).toBe(100000);
  });

  it("computes gross margin as 0 when no revenue", () => {
    const rows: FinancialModelRow[] = [
      makeRow({ category: "opex", subcategory: "salaries", amount: 5000, month: "2026-01" }),
    ];
    const result = computeDerivedMetrics(rows);
    expect(result.grossMargin).toBe(0);
    expect(result.mrr).toBe(0);
  });

  it("groups multiple months correctly", () => {
    const rows: FinancialModelRow[] = [
      makeRow({ category: "revenue", amount: 10000, month: "2026-01" }),
      makeRow({ category: "revenue", amount: 12000, month: "2026-02" }),
      makeRow({ category: "opex", subcategory: "salaries", amount: 8000, month: "2026-01" }),
      makeRow({ category: "opex", subcategory: "salaries", amount: 8000, month: "2026-02" }),
    ];
    const result = computeDerivedMetrics(rows);
    expect(result.monthlyData).toHaveLength(2);
    expect(result.monthlyData[0].month).toBe("2026-01");
    expect(result.monthlyData[1].month).toBe("2026-02");
    // MRR = latest month revenue
    expect(result.mrr).toBe(12000);
  });

  it("includes headcount in opex", () => {
    const rows: FinancialModelRow[] = [
      makeRow({ category: "revenue", amount: 10000, month: "2026-01" }),
      makeRow({ category: "opex", subcategory: "tools", amount: 2000, month: "2026-01" }),
      makeRow({ category: "headcount", subcategory: "engineering", amount: 5000, month: "2026-01" }),
    ];
    const result = computeDerivedMetrics(rows);
    expect(result.monthlyData[0].opex).toBe(7000);
    expect(result.opexBreakdown).toHaveLength(2);
  });

  it("sorts opex breakdown by total descending", () => {
    const rows: FinancialModelRow[] = [
      makeRow({ category: "opex", subcategory: "tools", amount: 1000, month: "2026-01" }),
      makeRow({ category: "opex", subcategory: "rent", amount: 5000, month: "2026-01" }),
      makeRow({ category: "opex", subcategory: "marketing", amount: 3000, month: "2026-01" }),
    ];
    const result = computeDerivedMetrics(rows);
    expect(result.opexBreakdown[0].subcategory).toBe("rent");
    expect(result.opexBreakdown[1].subcategory).toBe("marketing");
    expect(result.opexBreakdown[2].subcategory).toBe("tools");
  });
});
