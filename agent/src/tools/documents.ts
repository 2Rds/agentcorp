import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import * as XLSX from "xlsx";
import { parse as csvParse } from "csv-parse/sync";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

const MAX_CONTENT_LENGTH = 50000; // Limit text sent to agent to avoid token bloat

function truncate(text: string): string {
  if (text.length <= MAX_CONTENT_LENGTH) return text;
  return text.slice(0, MAX_CONTENT_LENGTH) + `\n\n[...truncated, showing first ${MAX_CONTENT_LENGTH} characters of ${text.length} total]`;
}

async function extractFileContent(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  // Excel files
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
    // Return raw CSV — it's already readable
    return text;
  }

  // PDF files
  if (ext === "pdf" || mimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer }) as any;
    await parser.load();
    const result = await parser.getText();
    return result.text ?? "";
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

  // Images — return description, can't extract text
  if (mimeType?.startsWith("image/")) {
    return `[Image file: ${fileName} (${mimeType}). Cannot extract text from images.]`;
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
    "Read and extract the text content of an uploaded document. Supports Excel (.xlsx/.xls), CSV, PDF, Word (.docx), text, markdown, and JSON files. Use list_documents first to find the document ID.",
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
        const result = `📄 **${doc.name}** (${doc.mime_type}, ${doc.size_bytes ? Math.round(doc.size_bytes / 1024) + "KB" : "unknown size"})\n\n${truncate(content)}`;
        return { content: [{ type: "text" as const, text: result }] };
      } catch (parseError: any) {
        return { content: [{ type: "text" as const, text: `Error parsing file "${doc.name}": ${parseError.message}` }], isError: true };
      }
    }
  );

  return [list_documents, read_document];
}
