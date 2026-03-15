import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { type AgentInfo } from '@/lib/agents';
import { type AgentHealth } from '@/hooks/useAgentHealth';
import { getDeptTheme } from '@/lib/department-theme';
import { cn } from '@/lib/utils';

interface AgentFleetCardProps {
  agent: AgentInfo;
  health?: AgentHealth;
  index: number;
}

export function AgentFleetCard({ agent, health, index }: AgentFleetCardProps) {
  const status = health?.status ?? 'unknown';
  const theme = getDeptTheme(agent.department);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.06,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      <Link to={`/${agent.department}`}>
        <div
          className={cn(
            'glass-card rounded-lg px-3 py-2.5 transition-all duration-200 cursor-pointer group relative overflow-hidden',
            theme.hoverShadow
          )}
        >
          {/* Department-colored left accent */}
          <div className={cn('absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b opacity-50 group-hover:opacity-100 transition-opacity', theme.gradient)} />

          <div className="relative flex items-center gap-2.5">
            <div className="relative">
              <div
                className={cn(
                  'h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 bg-gradient-to-br',
                  theme.gradient
                )}
              >
                {agent.name[0]}
              </div>
              {status === 'online' && (
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-[1.5px] ring-background" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate leading-tight">{agent.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{agent.title}</p>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
