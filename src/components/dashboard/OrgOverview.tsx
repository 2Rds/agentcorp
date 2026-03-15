import { useAuth } from '@/contexts/AuthContext';
import { AGENTS } from '@/lib/agents';
import { getDeptTheme } from '@/lib/department-theme';
import { cn } from '@/lib/utils';

export function OrgOverview() {
  const { displayName } = useAuth();

  return (
    <div className="glass-card gradient-border rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-4">Organization</h3>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground">
            {(displayName || 'C')[0]}
          </div>
          {displayName || 'CEO'}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-muted-foreground">CEO</span>
        </div>
        <div className="ml-4 border-l border-white/[0.08] pl-4 space-y-1.5">
          {AGENTS.map(agent => {
            const theme = getDeptTheme(agent.department);
            return (
              <div key={agent.id} className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', theme.bg)} />
                <span>{agent.name}</span>
                <span className="text-muted-foreground text-xs">({agent.title})</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
