import { ReactNode, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AGENT_BY_DEPT } from '@/lib/agents';
import { posthog } from '@/lib/posthog';
import { useAgentHealth } from '@/hooks/useAgentHealth';
import { getDeptTheme } from '@/lib/department-theme';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import AgentChat from '@/components/chat/AgentChat';

interface WorkspaceProps {
  department: string;
  tabs: { id: string; label: string; content: ReactNode }[];
}

export default function DepartmentWorkspace({ department, tabs }: WorkspaceProps) {
  const agent = AGENT_BY_DEPT[department];
  if (!agent) throw new Error(`Unknown department: ${department}`);
  useEffect(() => { posthog.capture?.('workspace_viewed', { department }); }, [department]);
  const { data: healthData } = useAgentHealth();
  const h = healthData?.find(d => d.agent.department === department);
  const status = h?.status ?? 'unknown';
  const theme = getDeptTheme(department);

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Enhanced Header */}
      <div className="relative px-6 py-4 border-b border-white/[0.06] shrink-0 overflow-hidden">
        {/* Department gradient accent line */}
        <div className={cn('absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r', theme.gradient)} />

        <div className="flex items-center gap-4">
          {/* Larger avatar with animated ring */}
          <div className="relative">
            <div
              className={cn(
                'h-11 w-11 rounded-xl flex items-center justify-center text-base font-bold text-white',
                theme.bg
              )}
            >
              {agent.name[0]}
            </div>
            {status === 'online' && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span className={cn('absolute inset-0 rounded-full animate-pulse-ring', theme.bg, 'opacity-40')} />
                <span className="relative h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-background" />
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{agent.name}</h1>
              <Badge
                variant={status === 'online' ? 'default' : 'secondary'}
                className={cn(
                  'text-[10px]',
                  status === 'online' && 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                )}
              >
                {status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{agent.title}</p>
          </div>

          {h?.uptime && (
            <div className="hidden sm:block text-right">
              <p className="text-[10px] text-muted-foreground">Uptime</p>
              <p className="text-xs font-mono text-foreground/80">{h.uptime}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-6 mt-3 w-fit shrink-0 bg-white/[0.03]">
          <TabsTrigger value="chat" className="data-[state=active]:bg-white/[0.08]">Chat</TabsTrigger>
          {tabs.map(t => (
            <TabsTrigger key={t.id} value={t.id} className="data-[state=active]:bg-white/[0.08]">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="chat" className="flex-1 min-h-0 m-0">
          <AgentChat agent={agent} />
        </TabsContent>

        {tabs.map(t => (
          <TabsContent key={t.id} value={t.id} className="flex-1 overflow-auto p-6 m-0">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {t.content}
            </motion.div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
