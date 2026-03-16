import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialModel } from "@/hooks/useFinancialModel";
import { useCapTable } from "@/hooks/useCapTable";
import ScenarioToggle from "@/components/dashboard/ScenarioToggle";
import SummaryCards from "@/components/dashboard/SummaryCards";
import PLChart from "@/components/dashboard/PLChart";
import BurnRunwayChart from "@/components/dashboard/BurnRunwayChart";
import CapTableView from "@/components/dashboard/CapTableView";
import OpExBreakdownView from "@/components/dashboard/OpExBreakdown";
import { Skeleton } from "@/components/ui/skeleton";

export default function FinancialOverviewTab() {
  const { orgId } = useAuth();
  const [scenario, setScenario] = useState("base");
  const { derived, isLoading: fmLoading } = useFinancialModel(orgId, scenario);
  const { summary, isLoading: ctLoading } = useCapTable(orgId);

  const loading = fmLoading || ctLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Financial Overview</h2>
        <ScenarioToggle value={scenario} onChange={setScenario} />
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : (
        <>
          <SummaryCards metrics={derived} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PLChart data={derived.monthlyData} />
            <BurnRunwayChart data={derived.monthlyData} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <OpExBreakdownView data={derived.opexBreakdown} />
            <CapTableView summary={summary} />
          </div>
        </>
      )}
    </div>
  );
}
