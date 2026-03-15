import { motion } from 'framer-motion';
import { type AgentInfo } from '@/lib/agents';
import { getDeptTheme } from '@/lib/department-theme';
import { cn } from '@/lib/utils';

interface ChatEmptyStateProps {
  agent: AgentInfo;
  onSelectPrompt: (prompt: string) => void;
}

export function ChatEmptyState({ agent, onSelectPrompt }: ChatEmptyStateProps) {
  const theme = getDeptTheme(agent.department);

  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex flex-col items-center gap-4"
      >
        {/* Avatar with glow */}
        <div className="relative">
          <div
            className={cn(
              'h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white',
              theme.bg
            )}
          >
            {agent.name[0]}
          </div>
          <div
            className="absolute inset-0 rounded-2xl animate-pulse-ring opacity-30"
            style={{ boxShadow: `0 0 20px 4px ${theme.glowBg}` }}
          />
        </div>

        <div className="text-center">
          <p className="text-base font-medium text-foreground">{agent.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{agent.title}</p>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">{agent.description}</p>
        </div>

        {/* Suggested Prompts */}
        {agent.suggestedPrompts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="flex flex-wrap justify-center gap-2 mt-2 max-w-md"
          >
            {agent.suggestedPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => onSelectPrompt(prompt)}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-full border transition-all',
                  'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12]',
                  'text-muted-foreground hover:text-foreground press-scale'
                )}
              >
                {prompt}
              </button>
            ))}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
