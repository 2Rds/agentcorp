import { cn } from '@/lib/utils';
import { getDeptTheme } from '@/lib/department-theme';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  department?: string;
  className?: string;
}

const sizes = {
  sm: 'h-4 w-4 border-[1.5px]',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
};

export function LoadingSpinner({ size = 'md', department, className }: LoadingSpinnerProps) {
  const theme = department ? getDeptTheme(department) : null;
  const borderColor = theme ? theme.border : 'border-primary/30';
  const topColor = theme ? theme.spinnerBorder : 'border-t-primary';

  return (
    <div
      className={cn(
        'rounded-full animate-spin',
        sizes[size],
        borderColor,
        topColor,
        className
      )}
    />
  );
}
