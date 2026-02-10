import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const MAX_CONTENT_LENGTH = 50000;

function truncate(text: string): string {
  if (text.length <= MAX_CONTENT_LENGTH) return text;
  return text.slice(0, MAX_CONTENT_LENGTH) + `\n\n[...truncated, showing first ${MAX_CONTENT_LENGTH} characters of ${text.length} total]`;
}

function htmlToText(html: string): string {
  // Strip scripts and styles
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  // Convert common block elements to newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|pre|hr)[^>]*>/gi, "\n");
  // Convert table cells to tabs
  text = text.replace(/<\/?(td|th)[^>]*>/gi, "\t");
  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

export function webFetchTools() {
  const fetch_url = tool(
    "fetch_url",
    "Fetch and read the content of a web page or URL. Extracts text content from HTML pages. Useful for reading shared documents, NotebookLM links, public spreadsheets, articles, or any web resource the user shares.",
    {
      url: z.string().url().describe("The URL to fetch"),
    },
    async (args) => {
      try {
        const response = await fetch(args.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; CFOAgent/1.0)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          return { content: [{ type: "text" as const, text: `Error fetching URL: HTTP ${response.status} ${response.statusText}` }], isError: true };
        }

        const contentType = response.headers.get("content-type") ?? "";
        const rawBody = await response.text();

        let extractedText: string;
        if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
          extractedText = htmlToText(rawBody);
        } else if (contentType.includes("application/json")) {
          try {
            extractedText = JSON.stringify(JSON.parse(rawBody), null, 2);
          } catch {
            extractedText = rawBody;
          }
        } else {
          // Plain text, CSV, XML, etc.
          extractedText = rawBody;
        }

        const result = `🌐 **${args.url}** (${contentType})\n\n${truncate(extractedText)}`;
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err: any) {
        if (err.name === "TimeoutError") {
          return { content: [{ type: "text" as const, text: `Error: Request timed out after 15 seconds for ${args.url}` }], isError: true };
        }
        return { content: [{ type: "text" as const, text: `Error fetching URL: ${err.message}` }], isError: true };
      }
    }
  );

  return [fetch_url];
}
