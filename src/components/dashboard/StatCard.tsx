import { type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAnimatedCounter } from '@/hooks/useAnimatedCounter';

interface StatCardProps {
  title: string;
  value: number;
  format?: (v: number) => string;
  icon: LucideIcon;
  index: number;
}

export function StatCard({ title, value, format, icon: Icon, index }: StatCardProps) {
  const animatedValue = useAnimatedCounter(value);
  const displayValue = format ? format(animatedValue) : animatedValue.toString();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.08,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      <div className="glass-card rounded-xl p-4 group relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <Icon className="h-4 w-4 text-muted-foreground/50" />
        </div>
        <div className="text-2xl font-bold font-mono tracking-tight">{displayValue}</div>
      </div>
    </motion.div>
  );
}
