import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface EditableCellProps {
  value: number;
  formula?: string | null;
  onSave: (value: number) => void;
}

export function formatAmount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

export default function EditableCell({ value, formula, onSave }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [highlight, setHighlight] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed !== value) {
      onSave(parsed);
      setHighlight(true);
      setTimeout(() => setHighlight(false), 600);
    }
  };

  if (formula) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "h-8 w-28 flex items-center justify-end px-2 text-sm font-mono text-muted-foreground italic cursor-default",
              value < 0 && "text-destructive"
            )}
          >
            {formatAmount(value)}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs font-mono">
          {formula}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-8 w-28 text-right text-sm font-mono px-2 py-0"
      />
    );
  }

  return (
    <div
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      className={cn(
        "h-8 w-28 flex items-center justify-end px-2 text-sm font-mono cursor-pointer rounded hover:bg-muted/50 transition-colors",
        value < 0 && "text-destructive",
        highlight && "bg-primary/10"
      )}
    >
      {formatAmount(value)}
    </div>
  );
}
