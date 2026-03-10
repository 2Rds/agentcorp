import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { config } from "../config.js";
import { parseDocumentWithVision } from "../lib/gemini-client.js";
import { indexDocument } from "../lib/document-indexer.js";
import { addOrgMemory } from "../lib/mem0-client.js";
import * as XLSX from "xlsx";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

const MAX_CONTENT_LENGTH = 50000; // Limit text sent to agent to avoid token bloat

function truncate(text: string): string {
  if (text.length <= MAX_CONTENT_LENGTH) return text;
  return text.slice(0, MAX_CONTENT_LENGTH) + `\n\n[...truncated, showing first ${MAX_CONTENT_LENGTH} characters of ${text.length} total]`;
}

const VISION_PROMPT = "Extract ALL text, numbers, data, and content from this image. Preserve structure, headings, bullet points, and tables. Return only the extracted content.";
const PDF_VISION_PROMPT = "Extract ALL text, numbers, data, and content from this document. Preserve structure, headings, bullet points, and tables. Return only the extracted content.";

/**
 * Call the Claude Sonnet API for vision-based content extraction.
 * Used as a fallback when Gemini vision is not configured.
 */
async function callClaudeVision(
  contentBlock: Record<string, unknown>,
  prompt: string,
  label: string
): Promise<string> {
  const { getAnthropicHeaders, getAnthropicBaseURL } = await import("../lib/model-router.js");
  const resp = await fetch(`${getAnthropicBaseURL()}/v1/messages`, {
    method: "POST",
    headers: getAnthropicHeaders(),
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [contentBlock, { type: "text", text: prompt }],
      }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`${label} API error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return data.content?.[0]?.text ?? "";
}

async function describeImage(buffer: Buffer, mimeType: string): Promise<string> {
  if (config.useGeminiVision) {
    return parseDocumentWithVision(buffer, mimeType, VISION_PROMPT);
  }

  const mediaType = mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  return callClaudeVision(
    { type: "image", source: { type: "base64", media_type: mediaType, data: buffer.toString("base64") } },
    VISION_PROMPT,
    "Vision"
  );
}

async function extractPdfWithVision(buffer: Buffer): Promise<string> {
  if (config.useGeminiVision) {
    return parseDocumentWithVision(buffer, "application/pdf", PDF_VISION_PROMPT);
  }

  return callClaudeVision(
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
    PDF_VISION_PROMPT,
    "PDF vision"
  );
}

async function extractFileContent(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  // Excel files — keep XLSX.js for structured parsing
  if (ext === "xlsx" || ext === "xls" || mimeType?.includes("spreadsheet") || mimeType?.includes("excel")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheets: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      sheets.push(`=== Sheet: ${sheetName} ===\n${csv}`);
    }
    return sheets.join("\n\n");
  }

  // CSV files
  if (ext === "csv" || mimeType === "text/csv") {
    const text = buffer.toString("utf-8");
    return text;
  }

  // PDF files
  if (ext === "pdf" || mimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer }) as any;
    await parser.load();
    const result = await parser.getText();
    const text = result.text ?? "";
    // If pdf-parse returned little/no text, it's likely a scanned PDF — use vision
    if (text.trim().length < 50) {
      return await extractPdfWithVision(buffer);
    }
    return text;
  }

  // Word documents
  if (ext === "docx" || mimeType?.includes("wordprocessingml")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // Plain text / markdown / JSON
  if (ext === "txt" || ext === "md" || ext === "json" || mimeType?.startsWith("text/") || mimeType === "application/json") {
    return buffer.toString("utf-8");
  }

  // Images — use vision to extract text/data
  if (mimeType?.startsWith("image/")) {
    return await describeImage(buffer, mimeType);
  }

  return `[Unsupported file type: ${fileName} (${mimeType}). Cannot extract content.]`;
}

export function documentsTools(orgId: string) {
  const list_documents = tool(
    "list_documents",
    "List all documents uploaded to the company's document repository. Returns names, types, sizes, and tags.",
    {
      tags: z.array(z.string()).optional().describe("Filter by document tags"),
    },
    async (args) => {
      let query = supabaseAdmin
        .from("documents")
        .select("id, name, mime_type, size_bytes, tags, created_at, version")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });

      if (args.tags && args.tags.length > 0) {
        query = query.overlaps("tags", args.tags);
      }

      const { data, error } = await query;
      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  const read_document = tool(
    "read_document",
    "Read and extract the text content of an uploaded document. Supports Excel (.xlsx/.xls), CSV, PDF (including scanned), Word (.docx), images (PNG/JPG/GIF/WEBP), text, markdown, and JSON files. Uses AI vision for images and scanned PDFs. Use list_documents first to find the document ID.",
    {
      document_id: z.string().describe("The document ID to read (from list_documents)"),
    },
    async (args) => {
      // Get document metadata
      const { data: doc, error: docError } = await supabaseAdmin
        .from("documents")
        .select("*")
        .eq("id", args.document_id)
        .eq("organization_id", orgId)
        .single();

      if (docError || !doc) {
        return { content: [{ type: "text" as const, text: `Error: Document not found (${docError?.message ?? "no match"})` }], isError: true };
      }

      // Download file from Supabase Storage
      const { data: fileData, error: dlError } = await supabaseAdmin
        .storage
        .from("agent-documents")
        .download(doc.storage_path);

      if (dlError || !fileData) {
        return { content: [{ type: "text" as const, text: `Error downloading file: ${dlError?.message ?? "unknown error"}` }], isError: true };
      }

      try {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        const content = await extractFileContent(buffer, doc.mime_type ?? "", doc.name);
        const result = `**${doc.name}** (${doc.mime_type}, ${doc.size_bytes ? Math.round(doc.size_bytes / 1024) + "KB" : "unknown size"})\n\n${truncate(content)}`;

        // Fire-and-forget: index document for RAG if not already indexed
        indexDocument(args.document_id, orgId).catch(err => {
          console.error(`Background indexing failed for document ${args.document_id}:`, err);
        });

        // Store document extraction summary in memory (Gemini attribution)
        const agentId = config.useGeminiVision ? "gemini-docs" : "opus-brain";
        addOrgMemory(
          `Document processed: "${doc.name}" (${doc.mime_type}). Content: ${content.slice(0, 500)}`,
          orgId,
          {
            agentId,
            category: "financial_model",
            metadata: { source: "document", document_id: doc.id, document_name: doc.name },
            timestamp: Math.floor(Date.now() / 1000),
          },
        ).catch(e => console.error("Mem0 memory store failed (document):", e));

        return { content: [{ type: "text" as const, text: result }] };
      } catch (parseError: any) {
        return { content: [{ type: "text" as const, text: `Error parsing file "${doc.name}": ${parseError.message}` }], isError: true };
      }
    }
  );

  return [list_documents, read_document];
}
