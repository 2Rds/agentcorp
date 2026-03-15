import { Building2 } from "lucide-react";

interface DataRoomLayoutProps {
  companyName: string;
  linkName: string;
  children: React.ReactNode;
}

export function DataRoomLayout({ companyName, linkName, children }: DataRoomLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">{companyName}</h1>
            <p className="text-xs text-muted-foreground">{linkName}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Investor Data Room</p>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  );
}
