import { describe, it, expect } from "vitest";
import { generateSlug, computeLinkAnalytics, type InvestorLink, type LinkView } from "./useInvestorLinks";

function makeLink(overrides: Partial<InvestorLink> = {}): InvestorLink {
  return {
    id: "link-1",
    organization_id: "org-1",
    created_by: "user-1",
    name: "Test Link",
    email: null,
    slug: "abc1234567",
    passcode: null,
    require_email: false,
    expires_at: null,
    is_active: true,
    allowed_document_ids: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeView(overrides: Partial<LinkView> = {}): LinkView {
  return {
    id: "view-1",
    link_id: "link-1",
    organization_id: "org-1",
    viewer_email: "investor@example.com",
    viewer_ip: null,
    started_at: "2026-01-15T10:00:00Z",
    duration_seconds: 120,
    pages_viewed: 5,
    total_pages: 10,
    last_page_viewed: 5,
    device_info: {},
    created_at: "2026-01-15T10:00:00Z",
    ...overrides,
  };
}

describe("generateSlug", () => {
  it("produces a 10-character string", () => {
    const slug = generateSlug();
    expect(slug).toHaveLength(10);
  });

  it("only contains lowercase alphanumeric characters", () => {
    for (let i = 0; i < 20; i++) {
      const slug = generateSlug();
      expect(slug).toMatch(/^[a-z0-9]{10}$/);
    }
  });

  it("produces unique slugs", () => {
    const slugs = new Set(Array.from({ length: 50 }, () => generateSlug()));
    expect(slugs.size).toBe(50);
  });
});

describe("computeLinkAnalytics", () => {
  it("returns empty analytics for empty input", () => {
    const result = computeLinkAnalytics([], []);
    expect(result).toHaveLength(0);
  });

  it("computes zero analytics for a link with no views", () => {
    const result = computeLinkAnalytics([makeLink()], []);
    expect(result).toHaveLength(1);
    expect(result[0].totalViews).toBe(0);
    expect(result[0].uniqueViewers).toBe(0);
    expect(result[0].avgDuration).toBe(0);
    expect(result[0].avgCompletion).toBe(0);
    expect(result[0].lastViewedAt).toBeNull();
  });

  it("computes total views and unique viewers", () => {
    const views: LinkView[] = [
      makeView({ id: "v1", viewer_email: "a@example.com" }),
      makeView({ id: "v2", viewer_email: "b@example.com" }),
      makeView({ id: "v3", viewer_email: "a@example.com" }),
    ];
    const result = computeLinkAnalytics([makeLink()], views);
    expect(result[0].totalViews).toBe(3);
    expect(result[0].uniqueViewers).toBe(2);
  });

  it("falls back to total views when all emails are null", () => {
    const views: LinkView[] = [
      makeView({ id: "v1", viewer_email: null }),
      makeView({ id: "v2", viewer_email: null }),
    ];
    const result = computeLinkAnalytics([makeLink()], views);
    expect(result[0].uniqueViewers).toBe(2);
  });

  it("computes average duration", () => {
    const views: LinkView[] = [
      makeView({ id: "v1", duration_seconds: 60 }),
      makeView({ id: "v2", duration_seconds: 180 }),
    ];
    const result = computeLinkAnalytics([makeLink()], views);
    expect(result[0].avgDuration).toBe(120);
  });

  it("computes average completion percentage", () => {
    const views: LinkView[] = [
      makeView({ id: "v1", pages_viewed: 5, total_pages: 10 }),
      makeView({ id: "v2", pages_viewed: 10, total_pages: 10 }),
    ];
    const result = computeLinkAnalytics([makeLink()], views);
    // (0.5 + 1.0) / 2 * 100 = 75%
    expect(result[0].avgCompletion).toBe(75);
  });

  it("handles zero total_pages gracefully", () => {
    const views: LinkView[] = [
      makeView({ id: "v1", pages_viewed: 0, total_pages: 0 }),
    ];
    const result = computeLinkAnalytics([makeLink()], views);
    expect(result[0].avgCompletion).toBe(0);
  });

  it("filters views to correct link", () => {
    const links = [makeLink({ id: "link-1" }), makeLink({ id: "link-2", name: "Other" })];
    const views: LinkView[] = [
      makeView({ id: "v1", link_id: "link-1" }),
      makeView({ id: "v2", link_id: "link-2" }),
      makeView({ id: "v3", link_id: "link-1" }),
    ];
    const result = computeLinkAnalytics(links, views);
    expect(result[0].totalViews).toBe(2);
    expect(result[1].totalViews).toBe(1);
  });
});
