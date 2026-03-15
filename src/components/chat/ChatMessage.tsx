import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { type AgentInfo } from '@/lib/agents';
import { getDeptTheme } from '@/lib/department-theme';
import { ChatMessageActions } from './ChatMessageActions';
import { ChatCodeBlock } from './ChatCodeBlock';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  agent: AgentInfo;
  index: number;
  isLast: boolean;
  onRegenerate?: () => void;
}

export function ChatMessage({ role, content, agent, index, isLast, onRegenerate }: ChatMessageProps) {
  const theme = getDeptTheme(agent.department);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: Math.min(index * 0.05, 0.3),
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className={cn('flex gap-3 group', role === 'user' ? 'justify-end' : 'justify-start')}
    >
      {role === 'assistant' && (
        <div
          className={cn(
            'h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white mt-0.5',
            theme.bg
          )}
        >
          {agent.name[0]}
        </div>
      )}
      <div className="max-w-[75%] min-w-0">
        <div
          className={cn(
            'rounded-xl px-4 py-2.5 text-sm',
            role === 'user'
              ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground'
              : `glass-card border-l-2 ${theme.border}`
          )}
        >
          {role === 'assistant' ? (
            <div className="prose prose-sm prose-invert max-w-none [&>p]:m-0 [&>p+p]:mt-2 [&>ul]:my-1 [&>ol]:my-1 [&>pre]:my-0">
              <ReactMarkdown
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const codeStr = String(children).replace(/\n$/, '');
                    if (match) {
                      return <ChatCodeBlock language={match[1]}>{codeStr}</ChatCodeBlock>;
                    }
                    return (
                      <code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {content || '...'}
              </ReactMarkdown>
            </div>
          ) : (
            content
          )}
        </div>
        {role === 'assistant' && content && (
          <ChatMessageActions content={content} isLast={isLast} onRegenerate={onRegenerate} />
        )}
      </div>
    </motion.div>
  );
}
