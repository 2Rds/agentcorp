import { Users } from "lucide-react";

export default function Investors() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Users className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Investor Portal</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          Manage investor access, share documents with granular controls, and track engagement analytics.
        </p>
      </div>
    </div>
  );
}
