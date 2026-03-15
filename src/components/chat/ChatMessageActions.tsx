import { useState } from 'react';
import { Copy, Check, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatMessageActionsProps {
  content: string;
  isLast: boolean;
  onRegenerate?: () => void;
}

export function ChatMessageActions({ content, isLast, onRegenerate }: ChatMessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.warn('[ChatMessageActions] Clipboard write failed');
    }
  };

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy} aria-label="Copy message">
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </Button>
      {isLast && onRegenerate && (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRegenerate} aria-label="Regenerate response">
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
      <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Thumbs up">
        <ThumbsUp className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Thumbs down">
        <ThumbsDown className="h-3 w-3" />
      </Button>
    </div>
  );
}
