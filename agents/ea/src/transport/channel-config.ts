/**
 * Channel classification and context building — pure functions.
 * Extracted for testability (no @slack/bolt or runtime deps).
 */

export interface ChannelConfig {
  agentId: string;
  department: string;
  description: string;
}

/** Workforce channels — each agent has a dedicated channel */
export const WORKFORCE_CHANNELS: Record<string, ChannelConfig> = {
  "workforce-alex":       { agentId: "blockdrive-ea",         department: "executive",  description: "EA Alex — direct requests, scheduling, communications, cross-dept coordination" },
  "workforce-finance":    { agentId: "blockdrive-cfa",        department: "finance",    description: "CFO Morgan — financial modeling, burn rate, revenue forecasting, investor docs" },
  "workforce-ops":        { agentId: "blockdrive-coa",        department: "operations", description: "COA Jordan — workforce operations, process optimization, agent performance" },
  "workforce-marketing":  { agentId: "blockdrive-cma",        department: "marketing",  description: "CMA Taylor — content strategy, brand voice, campaigns, social media" },
  "workforce-legal":      { agentId: "blockdrive-legal",      department: "legal",      description: "Legal Casey — contract review, compliance, policy drafting, risk assessment" },
  "workforce-sales":      { agentId: "blockdrive-sales",      department: "sales",      description: "Sales Sam — pipeline management, CRM, outreach, deal strategy" },
  "workforce-compliance": { agentId: "blockdrive-compliance", department: "compliance", description: "CCA Parker — audit trails, policy enforcement, regulatory compliance, risk assessment" },
};

/** Purpose-built channels — EA monitors and responds contextually */
export const PURPOSE_CHANNELS: Record<string, string> = {
  "brain-dump":       "Unstructured ideas, thoughts, and notes — EA triages and routes to appropriate departments",
  "command-center":   "High-level directives and cross-department coordination from CEO",
  "agents":           "Inter-agent communication, status updates, and system notifications",
  "brand":            "Brand guidelines, voice, visual identity, and design assets",
  "data-room":        "Investor data room updates, document notifications, and engagement alerts",
  "fundraise":        "Fundraising strategy, investor outreach, term sheets, and round progress",
  "gtm":              "Go-to-market strategy, launch planning, and market positioning",
  "waitlist-signups": "New waitlist signups, engagement notifications, and growth metrics",
  "general":          "General team communication",
};

/** Feed channels — notification-only, agents post updates but don't respond */
export const FEED_CHANNELS = new Set(["feed-ops", "feed-pipeline"]);

export function classifyChannel(channelName: string): {
  type: "workforce" | "purpose" | "feed" | "dm" | "unknown";
  config?: ChannelConfig;
  description?: string;
} {
  if (WORKFORCE_CHANNELS[channelName]) {
    return { type: "workforce", config: WORKFORCE_CHANNELS[channelName] };
  }
  if (PURPOSE_CHANNELS[channelName]) {
    return { type: "purpose", description: PURPOSE_CHANNELS[channelName] };
  }
  if (FEED_CHANNELS.has(channelName)) {
    return { type: "feed" };
  }
  // Slack DM channel IDs start with "D" — if the name is still a raw ID, it's a DM
  if (/^D[A-Z0-9]+$/.test(channelName)) {
    return { type: "dm" };
  }
  return { type: "unknown" };
}

export function buildSlackContext(channelName: string, userName: string): string {
  const classification = classifyChannel(channelName);
  const lines: string[] = [
    `[Slack context] Channel: #${channelName} | User: ${userName}`,
    `Transport: Slack (day-to-day business operations layer)`,
  ];

  if (classification.type === "workforce" && classification.config) {
    const cfg = classification.config;
    lines.push(`Department: ${cfg.department} | Designated agent: ${cfg.agentId}`);
    lines.push(`Channel purpose: ${cfg.description}`);

    if (cfg.agentId === "blockdrive-ea") {
      lines.push("This is your primary workforce channel. Handle requests directly.");
    } else {
      lines.push(
        `This is ${cfg.department}'s workforce channel. You have admin access. ` +
        `Handle the request with ${cfg.department}-relevant context. ` +
        `For highly specialized queries, note which department agent could provide deeper analysis.`
      );
    }
  } else if (classification.type === "purpose" && classification.description) {
    lines.push(`Channel purpose: ${classification.description}`);
    lines.push("This is a purpose-built channel. Respond with relevant context for this topic area.");
  } else if (classification.type === "dm") {
    lines.push("This is a direct message. Respond as you would in any direct conversation.");
  }

  return lines.join("\n");
}
