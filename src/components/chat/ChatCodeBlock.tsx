import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatCodeBlockProps {
  language?: string;
  children: string;
}

export function ChatCodeBlock({ language, children }: ChatCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.warn('[ChatCodeBlock] Clipboard write failed');
    }
  };

  return (
    <div className="relative group/code rounded-lg overflow-hidden my-2 bg-black/40 border border-white/[0.06]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.03] border-b border-white/[0.06]">
        <span className="text-[10px] text-muted-foreground font-mono">{language || 'code'}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 opacity-0 group-hover/code:opacity-100 transition-opacity"
          onClick={handleCopy}
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs font-mono leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}
