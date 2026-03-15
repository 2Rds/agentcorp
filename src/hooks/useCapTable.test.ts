import { describe, it, expect } from "vitest";
import { computeCapTableSummary, type CapTableEntry } from "./useCapTable";

function makeEntry(overrides: Partial<CapTableEntry> = {}): CapTableEntry {
  return {
    id: "1",
    organization_id: "org-1",
    stakeholder_name: "Founder",
    stakeholder_type: "founder",
    shares: 1000000,
    ownership_pct: 50,
    investment_amount: 0,
    share_price: 0.001,
    round_name: null,
    date: null,
    ...overrides,
  };
}

describe("computeCapTableSummary", () => {
  it("returns zero totals for empty entries", () => {
    const result = computeCapTableSummary([]);
    expect(result.totalShares).toBe(0);
    expect(result.totalInvestment).toBe(0);
    expect(result.byType).toHaveLength(0);
    expect(result.entries).toHaveLength(0);
  });

  it("sums shares and investment correctly", () => {
    const entries: CapTableEntry[] = [
      makeEntry({ shares: 1000000, investment_amount: 0 }),
      makeEntry({ id: "2", stakeholder_name: "Investor A", stakeholder_type: "investor", shares: 200000, investment_amount: 500000 }),
    ];
    const result = computeCapTableSummary(entries);
    expect(result.totalShares).toBe(1200000);
    expect(result.totalInvestment).toBe(500000);
  });

  it("groups by stakeholder type", () => {
    const entries: CapTableEntry[] = [
      makeEntry({ stakeholder_type: "founder", ownership_pct: 40 }),
      makeEntry({ id: "2", stakeholder_name: "CoFounder", stakeholder_type: "founder", ownership_pct: 20 }),
      makeEntry({ id: "3", stakeholder_name: "Investor A", stakeholder_type: "investor", ownership_pct: 15 }),
      makeEntry({ id: "4", stakeholder_name: "Investor B", stakeholder_type: "investor", ownership_pct: 10 }),
      makeEntry({ id: "5", stakeholder_name: "Employee", stakeholder_type: "employee", ownership_pct: 5 }),
    ];
    const result = computeCapTableSummary(entries);
    expect(result.byType).toHaveLength(3);

    const founders = result.byType.find((t) => t.type === "founder");
    expect(founders?.pct).toBe(60);
    expect(founders?.count).toBe(2);

    const investors = result.byType.find((t) => t.type === "investor");
    expect(investors?.pct).toBe(25);
    expect(investors?.count).toBe(2);
  });

  it("handles string amounts via Number() coercion", () => {
    const entries: CapTableEntry[] = [
      makeEntry({ shares: "500000" as unknown as number, investment_amount: "100000" as unknown as number }),
    ];
    const result = computeCapTableSummary(entries);
    expect(result.totalShares).toBe(500000);
    expect(result.totalInvestment).toBe(100000);
  });

  it("handles null-ish ownership_pct via Number() coercion", () => {
    const entries: CapTableEntry[] = [
      makeEntry({ ownership_pct: null as unknown as number }),
    ];
    const result = computeCapTableSummary(entries);
    const byType = result.byType.find((t) => t.type === "founder");
    expect(byType?.pct).toBe(0);
  });
});
