import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const MAX_CONTENT_LENGTH = 50000;
const DEFAULT_TIMEOUT = 15000;

function truncate(text: string): string {
  if (text.length <= MAX_CONTENT_LENGTH) return text;
  return text.slice(0, MAX_CONTENT_LENGTH) + `\n\n[...truncated, showing first ${MAX_CONTENT_LENGTH} characters of ${text.length} total]`;
}

export function headlessBrowserTools() {
  const browse_url = tool(
    "browse_url",
    "Browse a URL using a headless browser (Chromium). Unlike fetch_url, this renders JavaScript so it works with SPAs, React apps, pitch deck links (e.g. deck.blockdrive.co), and other JS-heavy pages. Use this when fetch_url returns empty or incomplete content.",
    {
      url: z.string().url().describe("The URL to browse"),
      wait_selector: z.string().optional().describe("Optional CSS selector to wait for before extracting content (e.g. '.slide-content', '#main')"),
      timeout: z.number().optional().describe("Timeout in milliseconds (default: 15000)"),
    },
    async (args) => {
      let browser;
      try {
        // Dynamic import to avoid crash if playwright not installed
        const { chromium } = await import("playwright");

        browser = await chromium.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        });

        const context = await browser.newContext({
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        });
        const page = await context.newPage();

        const timeout = args.timeout ?? DEFAULT_TIMEOUT;

        await page.goto(args.url, {
          waitUntil: "domcontentloaded",
          timeout,
        });

        // Wait for optional selector or a short network idle
        if (args.wait_selector) {
          await page.waitForSelector(args.wait_selector, { timeout: timeout / 2 }).catch(() => {
            // Selector not found, continue with what we have
          });
        } else {
          // Wait a bit for JS to render
          await page.waitForTimeout(2000);
        }

        const textContent = await page.evaluate(() => {
          return document.documentElement.innerText;
        });

        const title = await page.title();
        const finalUrl = page.url();

        await context.close();

        if (!textContent || textContent.trim().length === 0) {
          return {
            content: [{ type: "text" as const, text: `Page loaded (${finalUrl}) but no text content was extracted. The page may require authentication or have content protection.` }],
          };
        }

        const result = `**${title || args.url}**\nURL: ${finalUrl}\n\n${truncate(textContent.trim())}`;
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err: any) {
        if (err.message?.includes("Cannot find module") || err.message?.includes("playwright")) {
          return {
            content: [{ type: "text" as const, text: "Error: Playwright is not installed. The browse_url tool requires the playwright package. Use fetch_url as a fallback." }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: `Error browsing ${args.url}: ${err.message}` }],
          isError: true,
        };
      } finally {
        if (browser) {
          await browser.close().catch(() => {});
        }
      }
    }
  );

  return [browse_url];
}
