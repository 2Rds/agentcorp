/**
 * Tests for EA Slack channel classification and context building.
 * Tests the pure functions from agents/ea/src/transport/channel-config.ts
 * by re-importing directly (no @slack/bolt deps).
 */
import { describe, it, expect } from "vitest";
import { classifyChannel, buildSlackContext, WORKFORCE_CHANNELS, PURPOSE_CHANNELS, FEED_CHANNELS } from "../../agents/ea/src/transport/channel-config";

describe("classifyChannel", () => {
  it("classifies workforce channels", () => {
    const result = classifyChannel("workforce-alex");
    expect(result.type).toBe("workforce");
    expect(result.config?.agentId).toBe("blockdrive-ea");
    expect(result.config?.department).toBe("executive");
  });

  it("classifies all 7 workforce channels", () => {
    const workforceNames = Object.keys(WORKFORCE_CHANNELS);
    expect(workforceNames).toHaveLength(7);
    for (const name of workforceNames) {
      expect(classifyChannel(name).type).toBe("workforce");
    }
  });

  it("includes workforce-compliance", () => {
    const result = classifyChannel("workforce-compliance");
    expect(result.type).toBe("workforce");
    expect(result.config?.agentId).toBe("blockdrive-compliance");
    expect(result.config?.department).toBe("compliance");
  });

  it("classifies purpose channels", () => {
    const result = classifyChannel("brain-dump");
    expect(result.type).toBe("purpose");
    expect(result.description).toBeTruthy();
  });

  it("classifies all 9 purpose channels", () => {
    const purposeNames = Object.keys(PURPOSE_CHANNELS);
    expect(purposeNames).toHaveLength(9);
    for (const name of purposeNames) {
      expect(classifyChannel(name).type).toBe("purpose");
    }
  });

  it("classifies feed channels", () => {
    expect(classifyChannel("feed-ops").type).toBe("feed");
    expect(classifyChannel("feed-pipeline").type).toBe("feed");
  });

  it("classifies DM channel IDs", () => {
    expect(classifyChannel("D0123456789").type).toBe("dm");
    expect(classifyChannel("DABCDEF0123").type).toBe("dm");
  });

  it("returns unknown for unrecognized channels", () => {
    expect(classifyChannel("random-channel").type).toBe("unknown");
    expect(classifyChannel("some-other-thing").type).toBe("unknown");
  });

  it("does not classify lowercase d-prefixed names as DM", () => {
    expect(classifyChannel("data-room").type).toBe("purpose");
  });
});

describe("buildSlackContext", () => {
  it("includes channel and user info", () => {
    const ctx = buildSlackContext("workforce-alex", "Sean");
    expect(ctx).toContain("#workforce-alex");
    expect(ctx).toContain("Sean");
    expect(ctx).toContain("Slack");
  });

  it("adds department context for workforce channels", () => {
    const ctx = buildSlackContext("workforce-finance", "Sean");
    expect(ctx).toContain("finance");
    expect(ctx).toContain("blockdrive-cfa");
    expect(ctx).toContain("workforce channel");
  });

  it("identifies EA's own channel", () => {
    const ctx = buildSlackContext("workforce-alex", "Sean");
    expect(ctx).toContain("primary workforce channel");
    expect(ctx).toContain("Handle requests directly");
  });

  it("adds purpose context for purpose channels", () => {
    const ctx = buildSlackContext("command-center", "Sean");
    expect(ctx).toContain("purpose-built channel");
    expect(ctx).toContain("High-level directives");
  });

  it("adds DM context for DM channels", () => {
    const ctx = buildSlackContext("D0123456789", "Sean");
    expect(ctx).toContain("direct message");
  });

  it("does not add extra context for unknown channels", () => {
    const ctx = buildSlackContext("random-channel", "Sean");
    const lines = ctx.split("\n");
    // Only the header lines, no department/purpose context
    expect(lines).toHaveLength(2);
  });
});
