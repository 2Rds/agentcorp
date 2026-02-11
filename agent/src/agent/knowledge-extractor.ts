import { config } from "../config.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { chatCompletion } from "../lib/model-router.js";
import { addMemory } from "../lib/mem0-client.js";

const EXTRACT_PROMPT = `You extract structured knowledge from a conversation between a startup founder and their AI CFO.
Given the latest user message and assistant response, extract 0-3 distinct knowledge items that are worth remembering long-term.
Only extract concrete, reusable facts — company metrics, decisions, goals, financial figures, investor names, etc.
Skip generic advice or questions.

Return a JSON array (can be empty). Each item: {"title": "short label", "content": "detail paragraph"}
Return ONLY the JSON array, no markdown fences.`;

/**
 * Extract knowledge from conversation and store in both Mem0 and Supabase.
 * Uses Kimi K2 for extraction when available, falls back to Claude Sonnet.
 */
export async function extractKnowledge(userMsg: string, assistantMsg: string, organizationId: string) {
  try {
    const conversationText = `User: ${userMsg}\n\nAssistant: ${assistantMsg.slice(0, 2000)}`;
    let raw: string;

    if (config.useKimi) {
      // Use Kimi K2 for extraction (cheaper, great at structured output)
      raw = await chatCompletion("kimi", [
        { role: "system", content: EXTRACT_PROMPT },
        { role: "user", content: conversationText },
      ], { temperature: 0.2, maxTokens: 1000 });
    } else {
      // Fallback to Claude Sonnet
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": config.anthropicApiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1000,
          system: EXTRACT_PROMPT,
          messages: [{ role: "user", content: conversationText }],
          temperature: 0.2,
        }),
      });

      if (!resp.ok) {
        console.error("Knowledge extraction API error:", resp.status);
        return;
      }

      const data = await resp.json();
      raw = data.content?.[0]?.text?.trim();
      if (!raw) return;
    }

    let items: { title: string; content: string }[];
    try {
      items = JSON.parse(raw);
    } catch {
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return;
      items = JSON.parse(match[0]);
    }

    if (!Array.isArray(items) || items.length === 0) return;

    const validItems = items.filter(i => i.title && i.content).slice(0, 3);
    if (validItems.length === 0) return;

    // Dual-write: Mem0 + Supabase
    const mem0Promises = validItems.map(item =>
      addMemory(
        `${item.title}: ${item.content}`,
        organizationId,
        { source: "chat", title: item.title }
      )
    );

    const supabaseRows = validItems.map(i => ({
      organization_id: organizationId,
      title: i.title,
      content: i.content,
      source: "chat",
    }));

    // Run both in parallel
    const [mem0Results, supabaseResult] = await Promise.allSettled([
      Promise.all(mem0Promises),
      supabaseAdmin.from("knowledge_base").insert(supabaseRows),
    ]);

    if (mem0Results.status === "fulfilled") {
      const stored = mem0Results.value.filter(r => r && r.length > 0).length;
      if (stored > 0) console.log(`Stored ${stored} items in Mem0`);
    } else {
      console.error("Mem0 storage error:", mem0Results.reason);
    }

    if (supabaseResult.status === "fulfilled") {
      if (supabaseResult.value.error) {
        console.error("KB insert error:", supabaseResult.value.error);
      } else {
        console.log(`Extracted ${validItems.length} knowledge items to Supabase`);
      }
    } else {
      console.error("Supabase KB error:", supabaseResult.reason);
    }
  } catch (e) {
    console.error("Knowledge extraction error:", e);
  }
}
