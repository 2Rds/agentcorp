import { describe, it, expect } from "vitest";
import { formatAmount } from "./EditableCell";

describe("formatAmount", () => {
  it("formats values below 1000 with dollar sign", () => {
    expect(formatAmount(0)).toBe("$0");
    expect(formatAmount(500)).toBe("$500");
    expect(formatAmount(999)).toBe("$999");
  });

  it("formats 1000+ as K", () => {
    expect(formatAmount(1000)).toBe("$1.0K");
    expect(formatAmount(1500)).toBe("$1.5K");
    expect(formatAmount(50000)).toBe("$50.0K");
    expect(formatAmount(999999)).toBe("$1000.0K");
  });

  it("formats 1000000+ as M", () => {
    expect(formatAmount(1_000_000)).toBe("$1.0M");
    expect(formatAmount(2_500_000)).toBe("$2.5M");
    expect(formatAmount(10_000_000)).toBe("$10.0M");
  });

  it("handles negative values", () => {
    expect(formatAmount(-500)).toBe("$-500");
    expect(formatAmount(-5000)).toBe("$-5.0K");
    expect(formatAmount(-2_000_000)).toBe("$-2.0M");
  });

  it("handles zero", () => {
    expect(formatAmount(0)).toBe("$0");
  });

  it("handles boundary at exactly 1000 and 1000000", () => {
    expect(formatAmount(999)).toBe("$999");
    expect(formatAmount(1000)).toBe("$1.0K");
    expect(formatAmount(999999)).toBe("$1000.0K");
    expect(formatAmount(1000000)).toBe("$1.0M");
  });
});
