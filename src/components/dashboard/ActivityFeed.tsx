import { motion } from 'framer-motion';
import { useRecentActivity, formatTimeAgo, type ActivityItem } from '@/hooks/useDashboardStats';
import { getDeptTheme } from '@/lib/department-theme';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function ActivityFeed() {
  const { data: items, isLoading } = useRecentActivity();

  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-4">Recent Activity</h3>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-muted mt-1.5" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-2.5 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : !items || items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
      ) : (
        <div className="space-y-2.5 max-h-80 overflow-auto">
          {items.map((item, i) => (
            <ActivityRow key={item.id} item={item} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ item, index }: { item: ActivityItem; index: number }) {
  const theme = getDeptTheme(item.department);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex items-start gap-3 text-sm group hover:bg-white/[0.02] rounded-lg px-2 py-1.5 -mx-2 transition-colors"
    >
      <span className={cn('h-2 w-2 rounded-full mt-1.5 shrink-0', theme.bg)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-foreground/90">{item.description}</p>
        <p className="text-xs text-muted-foreground">
          {item.agent} · {formatTimeAgo(item.time)}
        </p>
      </div>
      <Badge variant="secondary" className="text-[10px] shrink-0 bg-white/[0.04]">
        {item.type}
      </Badge>
    </motion.div>
  );
}
