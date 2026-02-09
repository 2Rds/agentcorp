import { FileText } from "lucide-react";

export default function Documents() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <FileText className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Documents</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          Financial workbooks, investor reports, and pitch materials will be stored here.
        </p>
      </div>
    </div>
  );
}
