import { BarChart3 } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <BarChart3 className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Financial Dashboard</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          Your P&L, burn rate, runway, and investor metrics will appear here once you've built your financial model through the chat.
        </p>
      </div>
    </div>
  );
}
