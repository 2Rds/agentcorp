import { useRef } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type AgentInfo } from '@/lib/agents';

interface ChatInputProps {
  agent: AgentInfo;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isStreaming: boolean;
}

export function ChatInput({ agent, value, onChange, onSend, isStreaming }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="border-t border-white/[0.06] p-4">
      <div className="glass-card rounded-xl p-2 flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => { onChange(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={`Message ${agent.name}...`}
          aria-label={`Message ${agent.name}`}
          className="flex-1 resize-none bg-transparent px-3 py-2 text-sm focus:outline-none placeholder:text-muted-foreground/60"
        />
        <Button
          size="icon"
          onClick={onSend}
          disabled={!value.trim() || isStreaming}
          className="h-8 w-8 rounded-lg bg-primary hover:bg-primary/90 press-scale shrink-0"
          aria-label="Send message"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex items-center justify-between px-2 mt-1.5">
        <p className="text-[10px] text-muted-foreground/40">
          Shift+Enter for new line
        </p>
        {isStreaming && (
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: '0ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: '160ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: '320ms' }} />
            <span className="text-[10px] text-muted-foreground/50 ml-1">Streaming</span>
          </div>
        )}
      </div>
    </div>
  );
}
