/**
 * Board of Directors — LLM Council Pattern
 *
 * Inspired by Karpathy's LLM Council (github.com/karpathy/llm-council).
 * 4-stage deliberation using GENERALIZED single models as board members,
 * NOT specialized domain agents.
 *
 * Stage 1: Parallel — 4 board members independently analyze the question.
 *          Opus participates here as a full board member (dual-role).
 * Stage 2: Peer Review (optional) — Each member reviews others' responses
 *          (anonymized as "Response A, B, C") and ranks them.
 * Stage 3: Governance Brief — Gemini reviews member analyses for regulatory,
 *          compliance, and risk blind spots. Concise advisory brief feeds
 *          into the chairman's context.
 * Stage 4: Chairman Synthesis — Opus (now in chairman role) synthesizes all
 *          member analyses including its own, peer reviews, and governance
 *          brief into the final executive decision.
 *
 * Opus dual-role: participates in the debate as a board member AND
 * synthesizes the final decision as chairman. The most capable model
 * must be part of the debate, not just an observer who speaks last.
 *
 * 4 models across 4 board seats (Gemini dual-role as governance advisor):
 *   Opus        → Board member + Chairman (debates AND decides)
 *   Gemini      → Board member + Governance advisor (compliance brief)
 *   Grok 4.1    → Board member (non-reasoning variant)
 *   Sonar       → Board member
 *
 * No perspective prompts or role-playing — model diversity IS the
 * perspective diversity. Different training data, different RLHF,
 * different worldviews baked in at the foundation level. Pigeon-holing
 * models into narrow lenses takes away from natural reasoning.
 */

import type { BoardConfig, BoardMember, ChatMessage, CompletionResult } from "../types.js";
import type { ModelRouter } from "./router.js";
import { OPUS, GEMINI, SONAR, GROK_FAST } from "./registry.js";

// ─── Board Member Definitions ───────────────────────────────────────────────
// Minimal framing — model diversity IS the perspective diversity. Different
// training, different RLHF, different worldviews baked in at the foundation.

const CHAIRMAN_MEMBER: BoardMember = {
  role: "chairman",
  model: OPUS,
  perspective: `You are a board member. Provide your independent analysis of this strategic question.`,
};

const MEMBER_GEMINI: BoardMember = {
  role: "member-gemini",
  model: GEMINI,
  perspective: `You are a board member. Provide your independent analysis of this strategic question.`,
};

const MEMBER_GROK: BoardMember = {
  role: "member-grok",
  model: GROK_FAST,
  perspective: `You are a board member. Provide your independent analysis of this strategic question.`,
};

const MEMBER_SONAR: BoardMember = {
  role: "member-sonar",
  model: SONAR,
  perspective: `You are a board member. Provide your independent analysis of this strategic question.`,
};

// ─── Default Board Configuration ────────────────────────────────────────────

export const DEFAULT_BOARD: BoardConfig = {
  chairman: OPUS,
  members: [CHAIRMAN_MEMBER, MEMBER_GEMINI, MEMBER_GROK, MEMBER_SONAR],
  enablePeerReview: false,   // Only for high-stakes decisions
  quorum: 3,                 // Proceed if at least 3 of 4 members respond
  timeoutMs: 60_000,         // 60s max wait for all members
  governanceAdvisor: GEMINI,
};

/** High-stakes variant — enables anonymized peer review (Stage 2) */
export const HIGH_STAKES_BOARD: BoardConfig = {
  ...DEFAULT_BOARD,
  enablePeerReview: true,
  quorum: 4,                 // All members required for high-stakes
  timeoutMs: 120_000,        // 2 min for full deliberation
};

// ─── Board Session Executor ─────────────────────────────────────────────────

export interface BoardDecision {
  /** Final synthesized decision from the chairman */
  decision: string;
  /** Individual member analyses (for audit trail) */
  memberResponses: { role: string; model: string; response: string }[];
  /** Peer review rankings, if Stage 2 was enabled */
  peerReviews?: { reviewer: string; rankings: string }[];
  /** Governance advisory brief from governance advisor, if configured */
  governanceBrief?: string;
  /** Total cost of this board session */
  totalCostUsd: number;
  /** Total time for deliberation */
  totalMs: number;
}

export class BoardSession {
  constructor(
    private readonly router: ModelRouter,
    private readonly config: BoardConfig = DEFAULT_BOARD,
  ) {}

  /** Convene the board on a strategic question */
  async deliberate(question: string, context?: string): Promise<BoardDecision> {
    // Validate quorum
    if (this.config.quorum < 1) {
      throw new Error(`Invalid board quorum: ${this.config.quorum} (must be >= 1)`);
    }
    if (this.config.quorum > this.config.members.length) {
      throw new Error(
        `Board quorum ${this.config.quorum} exceeds member count ${this.config.members.length}`,
      );
    }

    const startTime = Date.now();
    const usageSnapshot = this.router.getUsageLog().length;

    // ── Stage 1: Parallel independent analysis ──
    const memberPromises = this.config.members.map(async (member) => {
      const messages: ChatMessage[] = [
        { role: "system", content: member.perspective },
        {
          role: "user",
          content: context
            ? `Context:\n${context}\n\nStrategic Question:\n${question}`
            : question,
        },
      ];

      const result = await this.withTimeout(
        this.router.complete(member.model, messages, {
          maxTokens: 2048,
          agentId: "board-of-directors",
        }),
        this.config.timeoutMs,
        `Board member '${member.role}'`,
      );

      return { role: member.role, model: member.model.alias, result };
    });

    const settled = await Promise.allSettled(memberPromises);
    const memberResponses = settled
      .filter((s): s is PromiseFulfilledResult<{ role: string; model: string; result: CompletionResult }> =>
        s.status === "fulfilled" && s.value.result !== null,
      )
      .map(s => ({
        role: s.value.role,
        model: s.value.model,
        response: s.value.result.content,
      }));

    const stage1Failures = settled
      .map((s, i) => ({ s, role: this.config.members[i]!.role }))
      .filter((x): x is { s: PromiseRejectedResult; role: string } => x.s.status === "rejected")
      .map(x => `${x.role}: ${x.s.reason instanceof Error ? x.s.reason.message : String(x.s.reason)}`);

    if (memberResponses.length < this.config.quorum) {
      throw new Error(
        `Board quorum not met: ${memberResponses.length}/${this.config.quorum} responded` +
        (stage1Failures.length > 0 ? `. Failures: ${stage1Failures.join("; ")}` : ""),
      );
    }

    // ── Stage 2 (optional): Anonymized peer review ──
    let peerReviews: { reviewer: string; rankings: string }[] | undefined;

    if (this.config.enablePeerReview && memberResponses.length >= 2) {
      const reviewPromises = memberResponses.map(async (reviewer, i) => {
        const otherResponses = memberResponses
          .filter((_, j) => j !== i)
          .map((r, idx) => `Response ${String.fromCharCode(65 + idx)}:\n${r.response}`)
          .join("\n\n---\n\n");

        const reviewMessages: ChatMessage[] = [
          {
            role: "system",
            content: `You are reviewing anonymized responses to a strategic question. Rank them from strongest to weakest reasoning and explain why. Be specific about reasoning quality, not just conclusions.`,
          },
          {
            role: "user",
            content: `Question: ${question}\n\n${otherResponses}\n\nRank these responses and explain your rankings.`,
          },
        ];

        const member = this.config.members.find(m => m.role === reviewer.role);
        if (!member) throw new Error(`No board member config for role '${reviewer.role}'`);
        const result = await this.router.complete(member.model, reviewMessages, {
          maxTokens: 1024,
          agentId: "board-of-directors",
        });

        return { reviewer: reviewer.role, rankings: result.content };
      });

      const reviewSettled = await Promise.allSettled(reviewPromises);
      peerReviews = reviewSettled
        .filter((s): s is PromiseFulfilledResult<{ reviewer: string; rankings: string }> =>
          s.status === "fulfilled",
        )
        .map(s => s.value);

      // Surface peer review failures in the audit trail
      const reviews = peerReviews;
      reviewSettled.forEach((s, i) => {
        if (s.status === "rejected") {
          const role = memberResponses[i]?.role ?? `reviewer-${i}`;
          const reason = s.reason instanceof Error ? s.reason.message : String(s.reason);
          reviews.push({ reviewer: role, rankings: `[Review failed: ${reason}]` });
        }
      });
    }

    // ── Stage 3: Governance brief (Gemini reviews for compliance/risk) ──
    let governanceBrief: string | undefined;

    if (this.config.governanceAdvisor) {
      const analysisForReview = memberResponses
        .map(r => `[${r.role}]:\n${r.response}`)
        .join("\n\n---\n\n");

      const governanceMessages: ChatMessage[] = [
        {
          role: "system",
          content: `You are a governance and compliance advisor to the Chairman of the Board. Your role is to review the board members' analyses and flag any regulatory, compliance, legal, ethical, or risk management concerns that the board may have overlooked. You do NOT make the strategic decision — you ensure the chairman has full awareness of governance implications before deciding. Be concise and specific. If there are no governance concerns, say so briefly.`,
        },
        {
          role: "user",
          content: `Strategic Question:\n${question}\n\n## Board Member Analyses\n\n${analysisForReview}\n\nProvide your governance advisory brief for the chairman.`,
        },
      ];

      try {
        const governanceResult = await this.withTimeout(
          this.router.complete(this.config.governanceAdvisor, governanceMessages, {
            maxTokens: 1024,
            agentId: "board-of-directors",
          }),
          15_000,
          "Governance advisor",
        );
        governanceBrief = governanceResult.content;
      } catch (err) {
        governanceBrief = `[Governance advisor unavailable: ${err instanceof Error ? err.message : String(err)}]`;
      }
    }

    // ── Stage 4: Chairman synthesis (with governance awareness) ──
    const analysisSection = memberResponses
      .map(r => `[${r.role} — ${r.model}]:\n${r.response}`)
      .join("\n\n---\n\n");

    const reviewSection = peerReviews
      ? "\n\n## Peer Reviews\n\n" + peerReviews.map(r => `[${r.reviewer}]:\n${r.rankings}`).join("\n\n")
      : "";

    const governanceSection = governanceBrief
      ? `\n\n## Governance Advisory Brief\n\n${governanceBrief}`
      : "";

    const chairmanMessages: ChatMessage[] = [
      {
        role: "system",
        content: `You are the Chairman of the Board. You participated in the debate and provided your own independent analysis (labeled "chairman" below). Now step back and synthesize ALL perspectives — including your own earlier analysis, which you should evaluate as critically as any other member's. You have ${memberResponses.length} board member analyses${peerReviews ? ", their peer reviews of each other's work," : ""}${governanceBrief ? " and a governance advisory brief from your compliance advisor" : ""}. Identify where the board agrees, where they disagree, and what the right path forward is.${governanceBrief ? " Ensure your decision addresses any governance or compliance concerns raised in the advisory brief." : ""} Be decisive — boards that can't decide are worse than boards that decide imperfectly.`,
      },
      {
        role: "user",
        content: `Strategic Question:\n${question}\n\n## Board Member Analyses\n\n${analysisSection}${reviewSection}${governanceSection}\n\nProvide your final synthesis and decision.`,
      },
    ];

    const chairmanResult = await this.router.complete(this.config.chairman, chairmanMessages, {
      maxTokens: 4096,
      agentId: "board-of-directors",
    });

    // ── Calculate session cost (non-destructive — does not drain shared router log) ──
    const sessionUsage = this.router.getUsageLog().slice(usageSnapshot);
    const totalCostUsd = sessionUsage.reduce((sum, e) => sum + e.costUsd, 0);

    return {
      decision: chairmanResult.content,
      memberResponses,
      peerReviews,
      governanceBrief,
      totalCostUsd,
      totalMs: Date.now() - startTime,
    };
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  }
}
