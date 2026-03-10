/**
 * PDF Export Tool — Generate branded investor documents as PDFs.
 *
 * Uses Playwright (via pdf-generator) to render HTML→PDF, then uploads
 * to Supabase Storage and returns a signed URL (matching excel-export pattern).
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { marked } from "marked";
import { supabaseAdmin } from "../lib/supabase.js";
import { generatePdf } from "../lib/pdf-generator.js";
import { renderMetricsOnePager, type MetricsData } from "../lib/templates/metrics-one-pager.js";

export function pdfExportTools(orgId: string) {
  const generate_investor_document = tool(
    "generate_investor_document",
    "Generate a branded PDF document for investors. Supports markdown content or structured metrics data. Uploads to Supabase Storage and returns a signed download URL (1 hour). Use doc_type 'metrics_one_pager' with metrics_json for financial summaries, or 'custom' with markdown content for any other document.",
    {
      title: z.string().describe("Document title (appears in header and filename)"),
      doc_type: z.enum(["exec_summary", "metrics_one_pager", "financial_summary", "custom"])
        .describe("Document type: exec_summary, metrics_one_pager, financial_summary, or custom"),
      content: z.string().optional()
        .describe("Markdown content for the document body (used for exec_summary, financial_summary, custom)"),
      metrics_json: z.string().optional()
        .describe("JSON string of MetricsData for metrics_one_pager (mrr, arr, monthlyBurn, runway, grossMargin, revenue, cogs, opex, headcount, cashOnHand, customMetrics)"),
      landscape: z.boolean().optional().describe("Use landscape orientation (default: false)"),
    },
    async (args) => {
      try {
        let bodyHtml: string;

        if (args.doc_type === "metrics_one_pager" && args.metrics_json) {
          const metricsData: MetricsData = JSON.parse(args.metrics_json);
          bodyHtml = renderMetricsOnePager(metricsData);
        } else if (args.content) {
          bodyHtml = await marked.parse(args.content);
        } else {
          return {
            content: [{ type: "text" as const, text: "Error: Provide either 'content' (markdown) or 'metrics_json' (for metrics_one_pager)." }],
            isError: true,
          };
        }

        const pdfBuffer = await generatePdf(bodyHtml, {
          title: args.title,
          landscape: args.landscape,
        });

        // Upload to Supabase Storage
        const safeName = args.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        const fileName = `${safeName}-${Date.now()}.pdf`;
        const storagePath = `${orgId}/investor-docs/${fileName}`;

        const { error: uploadError } = await supabaseAdmin
          .storage
          .from("agent-documents")
          .upload(storagePath, pdfBuffer, {
            contentType: "application/pdf",
            upsert: true,
          });

        if (uploadError) {
          return {
            content: [{ type: "text" as const, text: `Error uploading PDF: ${uploadError.message}` }],
            isError: true,
          };
        }

        // Generate signed URL (1 hour)
        const { data: urlData, error: urlError } = await supabaseAdmin
          .storage
          .from("agent-documents")
          .createSignedUrl(storagePath, 3600);

        if (urlError || !urlData?.signedUrl) {
          return {
            content: [{ type: "text" as const, text: `PDF uploaded but could not generate download URL: ${urlError?.message ?? "unknown error"}` }],
            isError: true,
          };
        }

        const sizeKb = Math.round(pdfBuffer.length / 1024);
        return {
          content: [{
            type: "text" as const,
            text: `PDF generated!\n\n**File:** ${fileName}\n**Size:** ${sizeKb} KB\n**Type:** ${args.doc_type}\n\n**Download:** ${urlData.signedUrl}\n\n(Link valid for 1 hour)`,
          }],
        };
      } catch (err: any) {
        if (err.message?.includes("playwright")) {
          return {
            content: [{ type: "text" as const, text: "Error: Playwright is not installed. PDF generation requires the playwright package." }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: `Error generating PDF: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  return [generate_investor_document];
}
