import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number;
  max: number;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function ProgressBar({
  value,
  max,
  className,
  showLabel = false,
  size = 'md',
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const actualPercentage = max > 0 ? (value / max) * 100 : 0;
  const isOverBudget = value > max;
  const isNearLimit = actualPercentage >= 90 && actualPercentage < 100;

  const getColor = () => {
    if (isOverBudget) return 'bg-[#EF4444]';
    if (isNearLimit) return 'bg-[#F59E0B]';
    return 'bg-[#10B981]';
  };

  const getStatusColor = () => {
    if (isOverBudget) return 'text-[#EF4444]';
    if (isNearLimit) return 'text-[#F59E0B]';
    return 'text-[#10B981]';
  };

  return (
    <div className={cn('w-full', className)}>
      <div className={cn(
        'w-full bg-gray-100 rounded-full overflow-hidden',
        size === 'sm' ? 'h-1.5' : 'h-2.5'
      )}>
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            getColor()
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-1 flex justify-between text-xs">
          <span className={getStatusColor()}>
            {actualPercentage.toFixed(0)}%
          </span>
          {isOverBudget && (
            <span className="text-[#EF4444] font-medium">Over Budget</span>
          )}
          {isNearLimit && (
            <span className="text-[#F59E0B] font-medium">Near Limit</span>
          )}
        </div>
      )}
    </div>
  );
}
