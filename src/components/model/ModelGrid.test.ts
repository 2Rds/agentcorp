import { describe, it, expect } from "vitest";
import { formatMonth, formatSummary } from "./ModelGrid";

describe("formatMonth", () => {
  it("formats YYYY-MM to short month and 2-digit year", () => {
    expect(formatMonth("2026-01")).toBe("Jan 26");
    expect(formatMonth("2026-06")).toBe("Jun 26");
    expect(formatMonth("2026-12")).toBe("Dec 26");
  });

  it("handles year rollover", () => {
    expect(formatMonth("2025-12")).toBe("Dec 25");
    expect(formatMonth("2027-01")).toBe("Jan 27");
  });
});

describe("formatSummary", () => {
  it("formats values below 1000", () => {
    expect(formatSummary(0)).toBe("$0");
    expect(formatSummary(500)).toBe("$500");
  });

  it("formats 1000+ as K", () => {
    expect(formatSummary(1000)).toBe("$1.0K");
    expect(formatSummary(25000)).toBe("$25.0K");
  });

  it("formats 1000000+ as M", () => {
    expect(formatSummary(1_000_000)).toBe("$1.0M");
    expect(formatSummary(5_500_000)).toBe("$5.5M");
  });

  it("handles negative values", () => {
    expect(formatSummary(-5000)).toBe("$-5.0K");
    expect(formatSummary(-2_000_000)).toBe("$-2.0M");
  });
});

describe("financial summary calculations", () => {
  // Test the calculation logic directly (mirrors ModelGrid summaries memo)
  function computeSummaries(
    rows: { month: string; category: string; amount: number }[]
  ) {
    const months = [...new Set(rows.map((r) => r.month))].sort();
    const grossProfit = new Map<string, number>();
    const totalOpex = new Map<string, number>();
    const ebitda = new Map<string, number>();

    for (const m of months) {
      let rev = 0, cogs = 0, opex = 0, hc = 0;
      for (const r of rows) {
        if (r.month !== m) continue;
        if (r.category === "revenue") rev += r.amount;
        else if (r.category === "cogs") cogs += r.amount;
        else if (r.category === "opex") opex += r.amount;
        else if (r.category === "headcount") hc += r.amount;
      }
      grossProfit.set(m, rev - cogs);
      totalOpex.set(m, opex + hc);
      ebitda.set(m, rev - cogs - opex - hc);
    }
    return { grossProfit, totalOpex, ebitda };
  }

  it("computes gross profit as revenue minus COGS", () => {
    const rows = [
      { month: "2026-01", category: "revenue", amount: 50000 },
      { month: "2026-01", category: "cogs", amount: 15000 },
    ];
    const { grossProfit } = computeSummaries(rows);
    expect(grossProfit.get("2026-01")).toBe(35000);
  });

  it("computes total OpEx as opex plus headcount", () => {
    const rows = [
      { month: "2026-01", category: "opex", amount: 10000 },
      { month: "2026-01", category: "headcount", amount: 25000 },
    ];
    const { totalOpex } = computeSummaries(rows);
    expect(totalOpex.get("2026-01")).toBe(35000);
  });

  it("computes EBITDA as revenue minus COGS minus opex minus headcount", () => {
    const rows = [
      { month: "2026-01", category: "revenue", amount: 100000 },
      { month: "2026-01", category: "cogs", amount: 20000 },
      { month: "2026-01", category: "opex", amount: 15000 },
      { month: "2026-01", category: "headcount", amount: 30000 },
    ];
    const { ebitda } = computeSummaries(rows);
    expect(ebitda.get("2026-01")).toBe(35000);
  });

  it("excludes funding from EBITDA", () => {
    const rows = [
      { month: "2026-01", category: "revenue", amount: 100000 },
      { month: "2026-01", category: "cogs", amount: 20000 },
      { month: "2026-01", category: "funding", amount: 500000 },
    ];
    const { ebitda } = computeSummaries(rows);
    expect(ebitda.get("2026-01")).toBe(80000);
  });

  it("computes summaries per month", () => {
    const rows = [
      { month: "2026-01", category: "revenue", amount: 50000 },
      { month: "2026-02", category: "revenue", amount: 60000 },
      { month: "2026-01", category: "cogs", amount: 10000 },
      { month: "2026-02", category: "cogs", amount: 12000 },
    ];
    const { grossProfit } = computeSummaries(rows);
    expect(grossProfit.get("2026-01")).toBe(40000);
    expect(grossProfit.get("2026-02")).toBe(48000);
  });

  it("handles months with missing categories", () => {
    const rows = [
      { month: "2026-01", category: "revenue", amount: 50000 },
      // No COGS, no opex, no headcount
    ];
    const { grossProfit, totalOpex, ebitda } = computeSummaries(rows);
    expect(grossProfit.get("2026-01")).toBe(50000);
    expect(totalOpex.get("2026-01")).toBe(0);
    expect(ebitda.get("2026-01")).toBe(50000);
  });
});
