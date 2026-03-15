import { useRef } from "react";
import type { DocumentEntry } from "@/components/finance/KnowledgeBaseTab";
import { Button } from "@/components/ui/button";
import { Upload, FileText, FileSpreadsheet, FileImage, File, Trash2 } from "lucide-react";

interface Props {
  documents: DocumentEntry[];
  onUpload: (files: File[]) => Promise<void>;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getIcon(mime: string | null) {
  if (!mime) return File;
  if (mime.includes("spreadsheet") || mime.includes("csv") || mime.includes("excel")) return FileSpreadsheet;
  if (mime.startsWith("image/")) return FileImage;
  if (mime.includes("pdf") || mime.includes("document") || mime.includes("text")) return FileText;
  return File;
}

export function KnowledgeDocuments({ documents, onUpload }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) await onUpload(files);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
      >
        <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground">Drop files here or click to upload</p>
        <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, XLSX, CSV, images, and more</p>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={handleSelect} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json,.png,.jpg,.jpeg" />
      </div>

      {/* Documents list */}
      {documents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No documents uploaded yet. Upload files to grow your agent's knowledge.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {documents.map(doc => {
            const Icon = getIcon(doc.mime_type);
            return (
              <div key={doc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-secondary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(doc.size_bytes)} • {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
                {doc.tags && doc.tags.length > 0 && (
                  <div className="hidden sm:flex gap-1">
                    {doc.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
