import { AGENTS } from '@/lib/agents';
import { useAgentHealth } from '@/hooks/useAgentHealth';
import { AgentFleetCard } from './AgentFleetCard';

export function AgentFleetGrid() {
  const { data: healthData } = useAgentHealth();

  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Agent Fleet</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {AGENTS.map((agent, i) => {
          const health = healthData?.find(d => d.agent.id === agent.id);
          return (
            <AgentFleetCard key={agent.id} agent={agent} health={health} index={i} />
          );
        })}
      </div>
    </div>
  );
}
