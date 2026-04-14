'use client';

import { useMemo, useState } from 'react';
import { useTransactionMonthStats } from '@/hooks';
import { getPreviousMonths, getMonthYearDisplay } from '@/lib/utils';
import { Award, ChevronLeft, ChevronRight, CircleDot, Minus } from 'lucide-react';

const TOTAL_MONTHS = 24;
const VISIBLE_MONTHS = 5;

interface MonthClosedBadgesProps {
  householdId: string | null;
}

export function MonthClosedBadges({ householdId }: MonthClosedBadgesProps) {
  const monthKeys = useMemo(
    () => [...getPreviousMonths(TOTAL_MONTHS)].reverse(),
    []
  );
  const maxWindowStart = Math.max(0, monthKeys.length - VISIBLE_MONTHS);
  const [windowStart, setWindowStart] = useState(() => maxWindowStart);

  const { byMonth, loading } = useTransactionMonthStats(householdId, monthKeys);

  const visibleKeys = monthKeys.slice(windowStart, windowStart + VISIBLE_MONTHS);

  if (!householdId) return null;

  return (
    <div className="mx-4 mb-3 rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-medium text-gray-700">Monthly progress</p>
        {loading && (
          <span className="text-[10px] text-gray-400">Updating…</span>
        )}
      </div>
      <div className="flex items-stretch gap-1 pb-1 pt-0.5">
        <button
          type="button"
          onClick={() => setWindowStart((s) => Math.max(0, s - 1))}
          disabled={windowStart <= 0 || loading}
          className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-30"
          aria-label="Older months"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 gap-2">
        {visibleKeys.map((m) => {
          const s = byMonth[m] ?? { total: 0, categorized: 0, uncategorized: 0 };
          const closed = s.total > 0 && s.uncategorized === 0;
          const inProgress = s.total > 0 && s.uncategorized > 0;
          const empty = s.total === 0;

          return (
            <div
              key={m}
              className={`flex min-w-0 flex-1 basis-0 flex-col items-center rounded-xl border px-1.5 py-2 sm:px-2 ${
                closed
                  ? 'border-amber-200 bg-amber-50/80'
                  : inProgress
                    ? 'border-teal-100 bg-teal-50/50'
                    : 'border-gray-100 bg-gray-50/80'
              }`}
              title={
                empty
                  ? `${getMonthYearDisplay(m)} — no transactions`
                  : closed
                    ? `${getMonthYearDisplay(m)} — month closed (all categorized)`
                    : `${getMonthYearDisplay(m)} — ${s.uncategorized} left`
              }
            >
              <span className="text-[10px] font-medium text-gray-500">
                {getMonthYearDisplay(m).split(' ')[0]}
              </span>
              <span className="text-[9px] text-gray-400">
                {m.slice(0, 4)}
              </span>
              <div className="mt-1 flex h-7 w-7 items-center justify-center">
                {loading ? (
                  <div className="h-3 w-3 animate-pulse rounded-full bg-gray-200" />
                ) : closed ? (
                  <Award className="h-5 w-5 text-amber-600" aria-hidden />
                ) : inProgress ? (
                  <CircleDot className="h-5 w-5 text-[#14B8A6]" aria-hidden />
                ) : (
                  <Minus className="h-4 w-4 text-gray-300" aria-hidden />
                )}
              </div>
              {!loading && !empty && (
                <span className="mt-0.5 text-[9px] text-gray-500">
                  {s.categorized}/{s.total}
                </span>
              )}
            </div>
          );
        })}
        </div>
        <button
          type="button"
          onClick={() =>
            setWindowStart((s) => Math.min(maxWindowStart, s + 1))
          }
          disabled={windowStart >= maxWindowStart || loading}
          className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-30"
          aria-label="Newer months"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <p className="mt-2 px-1 text-[10px] leading-relaxed text-gray-500">
        Gold badge = that calendar month has no uncategorized transactions. Use the ring after import
        to track your bulk pass, then keep months gold as you stay caught up.
      </p>
    </div>
  );
}
