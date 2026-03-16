import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { MODEL_TEMPLATES, type ModelTemplate } from "./templates";

interface TemplateSelectorProps {
  onSelect: (template: ModelTemplate) => void;
  onUploadXlsx: (file: File) => void;
  isCreating: boolean;
  isUploading?: boolean;
}

export default function TemplateSelector({ onSelect, onUploadXlsx, isCreating, isUploading }: TemplateSelectorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!/\.(xlsx|xls)$/i.test(file.name)) return;
    onUploadXlsx(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const busy = isCreating || !!isUploading;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 py-4">
        <h2 className="text-xl font-semibold">Choose a BlockDrive Model Template</h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Select the template that best fits your business model. Your Chief Financial Agent will begin building your financial intelligence dashboard by integrating files manually uploaded to its knowledge base, connected third party databases, and personalized context based on your conversations. Your model template is directly embedded in your dashboard via Google Sheets to fully preserve the formula driven logic in every cell.
        </p>
      </div>

      {/* Custom .xlsx upload drop zone */}
      <div
        onClick={() => !busy && fileRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-primary/5"
        } ${busy ? "opacity-50 pointer-events-none" : ""}`}
      >
        {isUploading ? (
          <Loader2 className="w-6 h-6 text-primary mx-auto mb-2 animate-spin" />
        ) : (
          <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
        )}
        <p className="text-sm font-medium text-foreground">
          {isUploading ? "Converting to Google Sheet..." : "Upload your own .xlsx file"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Drop an Excel workbook here or click to browse. Max 5MB. Values and formulas are preserved — merged cells, conditional formatting, and charts are not transferred.
        </p>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xls"
          onChange={(e) => {
            handleFiles(e.target.files);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODEL_TEMPLATES.map((template) => (
          <Card
            key={template.id}
            className="group cursor-pointer transition-all hover:border-primary/50 hover:shadow-md"
            onClick={() => !busy && onSelect(template)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <template.icon className="w-4.5 h-4.5 text-primary" />
                </div>
                <CardTitle className="text-sm font-semibold leading-tight">
                  {template.name}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                {template.description}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                disabled={busy}
              >
                {isCreating ? "Setting up..." : "Use This Template"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
