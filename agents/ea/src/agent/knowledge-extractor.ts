import { chatCompletion } from "../lib/model-router.js";
import { addOrgMemory } from "../lib/memory-client.js";

const EXTRACT_PROMPT = `You extract structured knowledge from a conversation between a CEO and their AI Executive Assistant (Alex).
Given the latest user message and assistant response, extract 0-3 distinct knowledge items worth remembering long-term.
Only extract concrete, reusable facts -- scheduling decisions, contact information, action items, strategic decisions, meeting outcomes, deadlines, preferences.
Skip generic advice, pleasantries, or questions.

For each item, assign a category from: scheduling, communications, cross_department, executive_decisions, meeting_notes, contacts, project_tracking, investor_relations, hiring

Return a JSON array (can be empty). Each item: {"title": "short label", "content": "detail paragraph", "category": "category_name"}
Return ONLY the JSON array, no markdown fences.`;

export async function extractKnowledge(
  userMsg: string,
  assistantMsg: string,
  organizationId: string,
  conversationId?: string,
) {
  try {
    const conversationText = `User: ${userMsg}\n\nAssistant: ${assistantMsg.slice(0, 2000)}`;

    const raw = await chatCompletion("gemini", [
      { role: "system", content: EXTRACT_PROMPT },
      { role: "user", content: conversationText },
    ], { temperature: 0.2, maxTokens: 1000 });

    let items: { title: string; content: string; category?: string }[];
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

    const results = await Promise.allSettled(
      validItems.map(item =>
        addOrgMemory(
          `${item.title}: ${item.content}`,
          organizationId,
          {
            agentId: "blockdrive-ea",
            runId: conversationId,
            metadata: { source: "chat", title: item.title },
            category: item.category,
            timestamp: Math.floor(Date.now() / 1000),
          },
        )
      )
    );

    const stored = results.filter(r => r.status === "fulfilled" && r.value?.length > 0).length;
    const failed = results.filter(r => r.status === "rejected").length;
    if (failed > 0) console.warn(`${failed}/${results.length} knowledge items failed to store`);
    if (stored > 0) console.log(`Stored ${stored} knowledge items in memory`);
  } catch (e) {
    console.error("Knowledge extraction error:", e);
  }
}
