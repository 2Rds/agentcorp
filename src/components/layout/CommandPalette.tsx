import { useEffect } from 'react';
import { Bot, Home, Settings, Zap } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useCommandSearch } from '@/hooks/useCommandSearch';
import { getDeptTheme } from '@/lib/department-theme';
import { cn } from '@/lib/utils';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const groupIcons = {
  agents: Bot,
  navigation: Home,
  actions: Zap,
};

const groupLabels = {
  agents: 'Agents',
  navigation: 'Navigation',
  actions: 'Quick Actions',
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { getItems } = useCommandSearch();
  const items = getItems();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, onOpenChange]);

  const groups = ['agents', 'navigation', 'actions'] as const;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search agents, actions, navigation..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((group, gi) => {
          const groupItems = items.filter(i => i.group === group);
          if (groupItems.length === 0) return null;
          const Icon = groupIcons[group];
          return (
            <div key={group}>
              {gi > 0 && <CommandSeparator />}
              <CommandGroup heading={groupLabels[group]}>
                {groupItems.map(item => {
                  const theme = item.department ? getDeptTheme(item.department) : null;
                  return (
                    <CommandItem
                      key={item.id}
                      onSelect={() => {
                        item.onSelect();
                        onOpenChange(false);
                      }}
                      className="gap-3"
                    >
                      {theme ? (
                        <span className={cn('h-2 w-2 rounded-full shrink-0', theme.bg)} />
                      ) : (
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span>{item.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
