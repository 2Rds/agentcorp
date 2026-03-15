import { DollarSign, CheckSquare, Megaphone } from 'lucide-react';
import { usePipelineValue, useOpenTasks, useActiveCampaigns, formatCurrency } from '@/hooks/useDashboardStats';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { AgentFleetGrid } from '@/components/dashboard/AgentFleetGrid';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';

export default function Dashboard() {
  const { data: pipelineValue } = usePipelineValue();
  const { data: openTasks } = useOpenTasks();
  const { data: activeCampaigns } = useActiveCampaigns();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto relative">
      {/* Subtle page-level background glow */}
      <div className="fixed top-0 left-1/3 w-[600px] h-[300px] bg-primary/[0.02] rounded-full blur-[120px] pointer-events-none" />

      <DashboardHeader />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Pipeline Value" value={pipelineValue ?? 0} icon={DollarSign} index={0} format={formatCurrency} />
        <StatCard title="Open Tasks" value={openTasks ?? 0} icon={CheckSquare} index={1} />
        <StatCard title="Active Campaigns" value={activeCampaigns ?? 0} icon={Megaphone} index={2} />
      </div>

      <AgentFleetGrid />

      <ActivityFeed />
    </div>
  );
}
