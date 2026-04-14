'use client';

import { cn } from '@/lib/utils';

interface InsightSparklineProps {
  values: number[];
  className?: string;
}

/** Minimal SVG sparkline; values oldest → newest. */
export function InsightSparkline({ values, className }: InsightSparklineProps) {
  const safe = values.length ? values : [0];
  const max = Math.max(...safe, 1e-6);
  const min = Math.min(...safe);
  const range = max - min || 1;

  if (safe.length < 2) {
    return (
      <div
        className={cn('h-11 w-full rounded-lg bg-gradient-to-r from-gray-100 to-gray-50', className)}
        aria-hidden
      />
    );
  }

  const pts = safe
    .map((v, i) => {
      const x = safe.length === 1 ? 50 : (i / (safe.length - 1)) * 100;
      const y = 26 - ((v - min) / range) * 22;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      viewBox="0 0 100 28"
      className={cn('h-11 w-full text-[#14B8A6]', className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}
