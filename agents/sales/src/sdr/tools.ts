/**
 * SDR Tools — Bridge pattern for Anthropic Messages API
 *
 * Follows the EA bridge pattern: native Anthropic API tool definitions + handler functions.
 * The SDR worker uses the Anthropic Messages API directly (not Agent SDK),
 * so tools are defined as Anthropic.Tool objects with handler maps.
 *
 * Tools (~14 total):
 *   Feature Store WRITE: compute_prospect_features, compute_industry_features, prepare_call_brief
 *   Feature Store READ: get_prospect_intelligence, get_hottest_prospects
 *   Research: research_prospect, web_search, fetch_url
 *   CRM: manage_pipeline, log_call, draft_email
 *   Knowledge: search_knowledge, save_knowledge
 *   Communication: message_agent
 */

import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import {
  safeFetchText, stripHtml, isAllowedUrl,
  type FeatureStore, type ProspectFeatures, type IndustryFeatures, type CallBriefFeatures,
} from "@waas/runtime";
import { config } from "../config.js";
import { getRuntime } from "../runtime-ref.js";

type ToolHandler = (args: Record<string, any>) => Promise<string>;

interface ToolEntry {
  def: Anthropic.Tool;
  handler: ToolHandler;
}

/** Run a callback with the FeatureStore, handling null checks and errors */
async function withFeatureStore(fn: (fs: FeatureStore) => Promise<string>, context?: string): Promise<string> {
  const fs = getRuntime()?.featureStore;
  if (!fs) return "Error: Feature Store not available — requires Redis + featureStore.enabled";
  try {
    return await fn(fs);
  } catch (e) {
    return `Error: Feature Store${context ? ` (${context})` : ""} operation failed: ${String(e)}`;
  }
}

/** Call Sonar Pro via OpenRouter for web search/research */
async function sonarQuery(prompt: string): Promise<string> {
  const apiUrl = config.perplexityApiKey
    ? "https://api.perplexity.ai/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
  const apiKey = config.perplexityApiKey || config.openRouterApiKey;
  const model = config.perplexityApiKey ? "sonar-pro" : "perplexity/sonar-pro";

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Sonar request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { choices?: Array<{ message: { content: string } }> };
  return data.choices?.[0]?.message?.content || "No results found.";
}

function createTools(orgId: string): ToolEntry[] {
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

  return [
    // ── Feature Store WRITE Tools ─────────────────────────────────────────

    {
      def: {
        name: "compute_prospect_features",
        description: "Write prospect intelligence to the Feature Store for sub-ms retrieval during voice calls. Call after researching a prospect or receiving new intel. Voice agents read what you write.",
        input_schema: {
          type: "object" as const,
          properties: {
            prospect_id: { type: "string", description: "Prospect ID (email, phone, or CRM ID)" },
            company: { type: "string", description: "Company name" },
            industry: { type: "string", description: "Industry slug (e.g., 'fintech', 'healthcare', 'saas')" },
            budget_range: { type: "string", description: "Estimated budget range (e.g., '$10K-$50K')" },
            pain_points: { type: "array", items: { type: "string" }, description: "Known pain points" },
            engagement_signals: { type: "array", items: { type: "string" }, description: "Buying/engagement signals observed" },
            heat_score: { type: "number", description: "Heat score 0-100 (0=cold, 100=ready to buy)" },
            decision_maker: { type: "boolean", description: "Whether the contact is a decision maker" },
            competitor: { type: "string", description: "Primary competitor being evaluated" },
            competitor_weakness: { type: "string", description: "Identified weakness of the competitor" },
            recommended_approach: { type: "string", description: "Recommended sales approach for this prospect" },
          },
          required: ["prospect_id", "company", "industry", "heat_score"],
        },
      },
      handler: async (args) => withFeatureStore(async (fs) => {
        const now = Math.floor(Date.now() / 1000);
        const features: ProspectFeatures = {
          prospectId: args.prospect_id,
          company: args.company,
          industry: args.industry,
          heatScore: args.heat_score,
          stage: "prospect",
          dealSize: 0,
          totalTouches: 0,
          daysSinceLastTouch: 0,
          painPoints: args.pain_points || [],
          objections: [],
          buyingSignals: args.engagement_signals || [],
          competitors: args.competitor ? [args.competitor] : [],
          decisionMaker: args.decision_maker ? "Yes" : "Unknown",
          decisionMakerTitle: "",
          bestCallHour: 10,
          commStyle: "direct",
          lastCallSummary: "",
          nextAction: args.recommended_approach || "",
          computedAt: now,
          expiresAt: now + 86400,
        };
        await fs.setProspectFeatures(features, undefined, orgId);
        return `Prospect features stored for ${args.company} (${args.prospect_id}), heat: ${args.heat_score}. Budget: ${args.budget_range || "unknown"}. ${args.competitor ? `Competitor: ${args.competitor}${args.competitor_weakness ? ` (weakness: ${args.competitor_weakness})` : ""}` : "No competitor noted."}`;
      }, "compute_prospect_features"),
    },

    {
      def: {
        name: "compute_industry_features",
        description: "Write industry benchmarks and intelligence to the Feature Store. Shared across all prospects in this industry. Update when you learn new patterns.",
        input_schema: {
          type: "object" as const,
          properties: {
            industry: { type: "string", description: "Industry slug (e.g., 'fintech', 'healthcare')" },
            avg_deal_size: { type: "number", description: "Average deal size in USD" },
            avg_sales_cycle_days: { type: "number", description: "Average sales cycle length in days" },
            common_objections: { type: "array", items: { type: "string" }, description: "Common objections heard in this industry" },
            effective_responses: { type: "object", description: "Map of objection → effective response" },
            win_rate: { type: "number", description: "Win rate for this industry (0-1)" },
            best_opening: { type: "string", description: "Best opening line/approach for this industry" },
            value_propositions: { type: "array", items: { type: "string" }, description: "Key value propositions that resonate" },
          },
          required: ["industry", "avg_deal_size", "avg_sales_cycle_days"],
        },
      },
      handler: async (args) => withFeatureStore(async (fs) => {
        const now = Math.floor(Date.now() / 1000);
        const objectionMap = args.common_objections && args.effective_responses
          ? (args.common_objections as string[]).map((obj: string) => ({
              objection: obj,
              response: (args.effective_responses as Record<string, string>)[obj] || "",
              winRate: args.win_rate || 0,
            }))
          : [];

        const features: IndustryFeatures = {
          industrySlug: args.industry,
          name: args.industry.replace(/-/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
          objectionMap,
          valueProps: args.value_propositions || [],
          competitors: [],
          avgDealCycleDays: args.avg_sales_cycle_days,
          avgDealSize: args.avg_deal_size,
          winRate: args.win_rate || 0,
          talkingPoints: [],
          regulations: [],
          openingLines: args.best_opening ? [{ line: args.best_opening, responseRate: 0 }] : [],
          computedAt: now,
          expiresAt: now + 604800,
        };
        await fs.setIndustryFeatures(features, undefined, orgId);
        return `Industry features stored for ${args.industry}: avg deal $${args.avg_deal_size}, cycle ${args.avg_sales_cycle_days}d, win rate ${((args.win_rate || 0) * 100).toFixed(0)}%`;
      }, "compute_industry_features"),
    },

    {
      def: {
        name: "prepare_call_brief",
        description: "Write a pre-call brief to the Feature Store. Voice agents read this at call start for instant context. Prepare briefs before every scheduled call.",
        input_schema: {
          type: "object" as const,
          properties: {
            prospect_id: { type: "string", description: "Prospect ID this brief is for" },
            call_id: { type: "string", description: "Unique call identifier" },
            talking_points: { type: "array", items: { type: "string" }, description: "Key talking points for this call" },
            objection_responses: { type: "object", description: "Map of predicted objection → prepared response" },
            strategy: { type: "string", description: "Overall call strategy (e.g., 'discovery', 'demo', 'closing')" },
            sdr_notes: { type: "string", description: "SDR research notes and context for the caller" },
          },
          required: ["prospect_id", "call_id", "talking_points", "strategy"],
        },
      },
      handler: async (args) => withFeatureStore(async (fs) => {
        const now = Math.floor(Date.now() / 1000);

        // Try to enrich from existing prospect features
        let company = "";
        try {
          const prospect = await fs.getProspectFeatures(args.prospect_id, orgId);
          if (prospect) company = prospect.company;
        } catch { /* non-fatal */ }

        const brief: CallBriefFeatures = {
          callId: args.call_id,
          prospectId: args.prospect_id,
          company,
          purpose: args.strategy as "cold_call" | "follow_up" | "demo" | "closing",
          openingScript: "",
          talkingPoints: args.talking_points,
          predictedObjections: args.objection_responses ? Object.keys(args.objection_responses) : [],
          objectionResponses: args.objection_responses || {},
          competitiveNotes: "",
          meetingBookingInfo: "",
          sdrNotes: args.sdr_notes || "",
          computedAt: now,
          expiresAt: now + 14400,
        };
        await fs.setCallBrief(brief, undefined, orgId);
        return `Call brief prepared for prospect ${args.prospect_id} (call: ${args.call_id}), strategy: ${args.strategy}, ${args.talking_points.length} talking points`;
      }, "prepare_call_brief"),
    },

    // ── Feature Store READ Tools ──────────────────────────────────────────

    {
      def: {
        name: "get_prospect_intelligence",
        description: "Read combined prospect + industry + call brief features from the Feature Store. Use to get the full intelligence package before working on a prospect.",
        input_schema: {
          type: "object" as const,
          properties: {
            prospect_id: { type: "string", description: "Prospect ID to look up" },
            call_id: { type: "string", description: "Call ID for a specific call brief (optional)" },
          },
          required: ["prospect_id"],
        },
      },
      handler: async (args) => withFeatureStore(async (fs) => {
        const intel = await fs.getCallIntelligence(args.prospect_id, args.call_id, orgId);
        if (!intel.prospect) {
          return JSON.stringify({ found: false, message: `No features found for ${args.prospect_id}. Use compute_prospect_features first.` });
        }
        return JSON.stringify({ found: true, prospect: intel.prospect, industry: intel.industry, brief: intel.brief });
      }, "get_prospect_intelligence"),
    },

    {
      def: {
        name: "get_hottest_prospects",
        description: "Read top prospects by heat score from the Feature Store. Use to prioritize research and call preparation.",
        input_schema: {
          type: "object" as const,
          properties: {
            limit: { type: "number", description: "Max number of prospects to return (default 10)" },
          },
        },
      },
      handler: async (args) => withFeatureStore(async (fs) => {
        const prospects = await fs.getHottestProspects(args.limit || 10, orgId);
        if (prospects.length === 0) return "No prospects in Feature Store. Use compute_prospect_features to add them.";
        return JSON.stringify(prospects.map(p => ({
          id: p.prospectId,
          company: p.company,
          heat: p.heatScore,
          stage: p.stage,
          dealSize: p.dealSize,
          nextAction: p.nextAction,
        })));
      }, "get_hottest_prospects"),
    },

    // ── Research Tools ────────────────────────────────────────────────────

    {
      def: {
        name: "research_prospect",
        description: "Deep prospect research via Sonar Pro. Returns company profile, key contacts, pain points, competitive landscape, and approach recommendations.",
        input_schema: {
          type: "object" as const,
          properties: {
            company: { type: "string", description: "Company name to research" },
            contact_name: { type: "string", description: "Specific contact to research (optional)" },
          },
          required: ["company"],
        },
      },
      handler: async (args) => {
        try {
          const prompt = args.contact_name
            ? `Research ${args.contact_name} at ${args.company} for a B2B sales approach. Provide: 1) Their role and responsibilities, 2) Professional background and career history, 3) Recent activity (LinkedIn posts, conference talks, publications), 4) Connection points for outreach, 5) Communication style preferences if discernible.`
            : `Research ${args.company} for a B2B sales approach. Provide: 1) Company overview (size, industry, revenue, funding), 2) Key decision makers and their roles, 3) Recent news and events, 4) Potential pain points and challenges, 5) Technology stack, 6) Competitors they may be evaluating, 7) Recommended approach angle and value proposition.`;
          const result = await sonarQuery(prompt);
          return result;
        } catch (e: any) {
          return `Research error: ${e.message}`;
        }
      },
    },

    {
      def: {
        name: "web_search",
        description: "General web search for prospect research, industry trends, competitive intelligence, and market data.",
        input_schema: {
          type: "object" as const,
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
      },
      handler: async (args) => {
        try {
          return await sonarQuery(args.query);
        } catch (e: any) {
          return `Search error: ${e.message}`;
        }
      },
    },

    {
      def: {
        name: "fetch_url",
        description: "Fetch and read a web page for prospect research or competitive analysis. Strips HTML for clean text output. Blocked for internal/private URLs (SSRF protection).",
        input_schema: {
          type: "object" as const,
          properties: {
            url: { type: "string", description: "URL to fetch" },
          },
          required: ["url"],
        },
      },
      handler: async (args) => {
        const check = isAllowedUrl(args.url);
        if (!check.allowed) return `Error: URL blocked — ${check.reason}`;
        try {
          const result = await safeFetchText(
            args.url,
            { headers: { "User-Agent": "BlockDrive-SDR/1.0" }, signal: AbortSignal.timeout(15000) },
            "Fetch URL",
          );
          if (!result.ok) return `Error: ${result.error}`;
          return stripHtml(result.data).slice(0, 8000);
        } catch (e: any) {
          return `Fetch error: ${e.message}`;
        }
      },
    },

    // ── CRM Tools ─────────────────────────────────────────────────────────

    {
      def: {
        name: "manage_pipeline",
        description: "Create, update, or list deals in the sales pipeline. IMPORTANT: You cannot set stage to closed_won or closed_lost — those require Sales Manager approval.",
        input_schema: {
          type: "object" as const,
          properties: {
            action: { type: "string", enum: ["create", "update", "list"], description: "Action to perform" },
            company: { type: "string", description: "Company name (required for create)" },
            deal_id: { type: "string", description: "Deal ID (required for update)" },
            contact: { type: "string", description: "Primary contact name" },
            stage: { type: "string", enum: ["prospect", "qualified", "proposal", "negotiation"], description: "Pipeline stage (closed_won/closed_lost NOT allowed — escalate to Sam)" },
            value: { type: "number", description: "Deal value in USD" },
            probability: { type: "number", description: "Close probability (0-100)" },
            expected_close: { type: "string", description: "Expected close date (ISO 8601)" },
            source: { type: "string", description: "Lead source" },
            tags: { type: "string", description: "Comma-separated tags" },
            notes: { type: "string", description: "Deal notes" },
          },
          required: ["action"],
        },
      },
      handler: async (args) => {
        try {
          // Enforce closed stage restriction
          if (args.stage === "closed_won" || args.stage === "closed_lost") {
            return "Error: Stage changes to closed_won/closed_lost require Sales Manager approval. Use message_agent to escalate to Sam (blockdrive-sales).";
          }

          if (args.action === "list") {
            const { data, error } = await supabase
              .from("sales_pipeline")
              .select("id, company, contact, stage, value, probability, expected_close, source, tags")
              .eq("org_id", orgId)
              .not("stage", "in", '("closed_won","closed_lost")')
              .order("value", { ascending: false })
              .limit(25);
            if (error) return `Error: Pipeline list failed: ${error.message}`;
            if (!data?.length) return "No active deals in pipeline.";
            return JSON.stringify(data);
          }

          if (args.action === "create") {
            if (!args.company) return "Error: company is required for create action";
            const { data, error } = await supabase
              .from("sales_pipeline")
              .insert({
                org_id: orgId,
                company: args.company,
                contact: args.contact || null,
                stage: args.stage || "prospect",
                value: args.value || 0,
                probability: args.probability || 10,
                expected_close: args.expected_close || null,
                source: args.source || null,
                tags: args.tags?.split(",").map((t: string) => t.trim()) || [],
                notes: args.notes || null,
              })
              .select("id, company, stage, value, probability")
              .single();
            if (error) return `Error: Pipeline create failed: ${error.message}`;
            return JSON.stringify(data);
          }

          // update
          if (!args.deal_id) return "Error: deal_id is required for update action";
          const updates: Record<string, unknown> = {};
          if (args.company) updates.company = args.company;
          if (args.contact) updates.contact = args.contact;
          if (args.stage) updates.stage = args.stage;
          if (args.value !== undefined) updates.value = args.value;
          if (args.probability !== undefined) updates.probability = args.probability;
          if (args.expected_close) updates.expected_close = args.expected_close;
          if (args.source) updates.source = args.source;
          if (args.tags) updates.tags = args.tags.split(",").map((t: string) => t.trim());
          if (args.notes) updates.notes = args.notes;
          updates.updated_at = new Date().toISOString();

          const { data, error } = await supabase
            .from("sales_pipeline")
            .update(updates)
            .eq("id", args.deal_id)
            .eq("org_id", orgId)
            .select("id, company, stage, value, probability")
            .single();
          if (error) return `Error: Pipeline update failed: ${error.message}`;
          return JSON.stringify(data);
        } catch (e: any) {
          return `Error: Pipeline operation failed: ${e.message}`;
        }
      },
    },

    {
      def: {
        name: "log_call",
        description: "Record call notes, action items, and next steps. Use after processing call outcomes.",
        input_schema: {
          type: "object" as const,
          properties: {
            pipeline_id: { type: "string", description: "Pipeline deal ID to link this call to" },
            type: { type: "string", enum: ["discovery", "demo", "follow_up", "negotiation", "close", "check_in"], description: "Call type" },
            summary: { type: "string", description: "Call summary — key points discussed" },
            action_items: { type: "array", items: { type: "object", properties: { action: { type: "string" }, assignee: { type: "string" }, due: { type: "string" } } }, description: "Action items from the call" },
            sentiment: { type: "string", enum: ["very_positive", "positive", "neutral", "negative", "very_negative"], description: "Overall call sentiment" },
            next_steps: { type: "string", description: "Agreed next steps and timeline" },
          },
          required: ["type", "summary", "sentiment", "next_steps"],
        },
      },
      handler: async (args) => {
        try {
          const { data, error } = await supabase
            .from("sales_call_logs")
            .insert({
              org_id: orgId,
              pipeline_id: args.pipeline_id || null,
              type: args.type,
              summary: args.summary,
              action_items: args.action_items || [],
              sentiment: args.sentiment,
              next_steps: args.next_steps,
            })
            .select("id, type, sentiment")
            .single();
          if (error) return `Error: Call log failed: ${error.message}`;
          return JSON.stringify({ ...data, message: "Call logged successfully." });
        } catch (e: any) {
          return `Error: Call log failed: ${e.message}`;
        }
      },
    },

    {
      def: {
        name: "draft_email",
        description: "Draft an outreach, follow-up, or nurture email. Saved to communications log. All external emails require CEO approval before sending.",
        input_schema: {
          type: "object" as const,
          properties: {
            recipient: { type: "string", description: "Recipient name and/or email" },
            subject: { type: "string", description: "Email subject line" },
            body: { type: "string", description: "Email body content" },
            email_type: { type: "string", enum: ["cold_outreach", "follow_up", "nurture", "confirmation"], description: "Type of email" },
          },
          required: ["recipient", "subject", "body", "email_type"],
        },
      },
      handler: async (args) => {
        try {
          const { data, error } = await supabase
            .from("sales_call_logs")
            .insert({
              org_id: orgId,
              pipeline_id: null,
              type: "email",
              summary: JSON.stringify({
                to: args.recipient,
                subject: args.subject,
                body: args.body,
                email_type: args.email_type,
              }),
              action_items: [{ action: "Review and send email", status: "pending" }],
              sentiment: "neutral",
              next_steps: "CEO approval required before sending",
            })
            .select("id")
            .single();
          if (error) return `Error: Draft failed: ${error.message}`;
          return JSON.stringify({
            id: data?.id,
            subject: args.subject,
            type: args.email_type,
            status: "draft",
            message: "Email draft saved. CEO approval required before sending.",
          });
        } catch (e: any) {
          return `Error: Draft failed: ${e.message}`;
        }
      },
    },

    // ── Knowledge Tools ───────────────────────────────────────────────────

    {
      def: {
        name: "search_knowledge",
        description: "Search sales namespace memory for prospect research, deal history, call transcripts, competitive intel, and outreach patterns.",
        input_schema: {
          type: "object" as const,
          properties: {
            query: { type: "string", description: "Natural language search query" },
            limit: { type: "number", description: "Max results (default 10)" },
          },
          required: ["query"],
        },
      },
      handler: async (args) => {
        const memory = getRuntime()?.memory;
        if (!memory) return "Error: Memory system not available";
        try {
          // Search shared sales namespace (not just SDR) so SDR sees Sam's knowledge too
          const results = await memory.searchAgentMemories("blockdrive-sales", orgId, args.query, args.limit || 10);
          if (!results.length) return "No matching knowledge found.";
          return results.map((r: any) => `- ${r.memory}`).join("\n");
        } catch (e: any) {
          return `Error: Memory search failed: ${e.message}`;
        }
      },
    },

    {
      def: {
        name: "save_knowledge",
        description: "Save SDR knowledge — prospect research, call transcripts, competitive intel, pipeline hygiene notes, outreach sequence performance.",
        input_schema: {
          type: "object" as const,
          properties: {
            content: { type: "string", description: "The knowledge to save (1-3 concise sentences)" },
            category: { type: "string", enum: ["prospect_research", "call_transcripts", "competitive_intel", "pipeline_hygiene", "outreach_sequences"], description: "Knowledge category" },
          },
          required: ["content", "category"],
        },
      },
      handler: async (args) => {
        const memory = getRuntime()?.memory;
        if (!memory) return "Error: Memory system not available";
        try {
          const events = await memory.addAgentMemory("blockdrive-sdr", orgId, args.content, "operational", { category: args.category });
          return `Saved to ${args.category}: ${JSON.stringify(events)}`;
        } catch (e: any) {
          return `Error: Memory save failed: ${e.message}`;
        }
      },
    },

    // ── Communication ─────────────────────────────────────────────────────

    {
      def: {
        name: "message_agent",
        description: "Send a message to Sam (Sales Manager). Use to escalate deal closings, request approval for closed_won/closed_lost stages, or report important findings. Can only message: blockdrive-sales.",
        input_schema: {
          type: "object" as const,
          properties: {
            subject: { type: "string", description: "Message subject (max 200 chars)" },
            message: { type: "string", description: "Message content (max 4000 chars)" },
            priority: { type: "string", enum: ["normal", "urgent"], description: "Message priority" },
            requires_response: { type: "boolean", description: "Whether you need a reply from Sam" },
          },
          required: ["subject", "message"],
        },
      },
      handler: async (args) => {
        try {
          const runtime = getRuntime();
          const bus = runtime?.getMessageBus();
          if (!bus) {
            // Fallback to Supabase agent_messages table
            const supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
            const { data, error } = await supabaseAdmin
              .from("agent_messages")
              .insert({
                org_id: orgId,
                sender_id: "blockdrive-sdr",
                target_id: "blockdrive-sales",
                message: `${args.subject}: ${args.message}`,
                priority: args.priority || "normal",
                status: "queued",
              })
              .select("id, target_id, status")
              .single();
            if (error) return `Error: Message send failed: ${error.message}`;
            return `Message sent to blockdrive-sales (ID: ${data.id}, status: ${data.status})`;
          }

          const receipt = await bus.send({
            from: "blockdrive-sdr",
            to: "blockdrive-sales",
            type: args.requires_response ? "request" : "notification",
            priority: args.priority || "normal",
            subject: args.subject,
            body: args.message,
          });
          return `Message ${receipt.messageId} sent to blockdrive-sales`;
        } catch (e: any) {
          return `Error: Message send failed: ${e.message}`;
        }
      },
    },
  ];
}

/**
 * Creates all SDR tools for the Anthropic Messages API.
 * Follows the EA bridge pattern: returns toolDefs + handlers map.
 */
export function createSdrTools(orgId: string): {
  toolDefs: Anthropic.Tool[];
  handlers: Map<string, ToolHandler>;
} {
  const tools = createTools(orgId);
  const toolDefs = tools.map((t) => t.def);
  const handlers = new Map<string, ToolHandler>();
  for (const t of tools) {
    handlers.set(t.def.name, t.handler);
  }
  return { toolDefs, handlers };
}
