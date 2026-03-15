import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { getDeptTheme } from '@/lib/department-theme';
import { cn } from '@/lib/utils';

interface DetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  department?: string;
  data: Record<string, unknown>;
}

export function DetailSheet({ open, onOpenChange, title, department, data }: DetailSheetProps) {
  const theme = department ? getDeptTheme(department) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="glass-card border-l border-white/[0.08] w-[400px] sm:w-[540px]">
        <SheetHeader>
          {theme && (
            <div className={cn('h-1 w-12 rounded-full mb-2', theme.bg)} />
          )}
          <SheetTitle className="text-base">{title}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-3">
          {Object.entries(data).map(([key, value]) => {
            if (key === 'id' || key === 'org_id' || key === 'organization_id') return null;
            return (
              <div key={key} className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  {key.replace(/_/g, ' ')}
                </span>
                <span className="text-sm text-foreground/90">
                  {formatValue(value)}
                </span>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function formatValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
