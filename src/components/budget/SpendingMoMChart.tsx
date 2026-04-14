'use client';

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency, getMonthYearDisplay, CHART_MONTH_MAX_OFFSET } from '@/lib/utils';
import type { Transaction } from '@/types/database';

export type MoMChartMode = 'personal' | 'joint' | 'total_share';

interface MonthBucket {
  personA: number;
  personB: number;
  joint: number;
}

function monthKeyFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function shortMonthLabel(monthYear: string): string {
  const [y, m] = monthYear.split('-');
  const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1);
  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d);
}

function aggregateByMonth(
  transactions: Transaction[],
  monthKeys: string[]
): Record<string, MonthBucket> {
  const map: Record<string, MonthBucket> = {};
  for (const k of monthKeys) {
    map[k] = { personA: 0, personB: 0, joint: 0 };
  }
  for (const t of transactions) {
    const k = monthKeyFromDate(t.date);
    if (!map[k]) continue;
    const amt = Number(t.amount);
    if (t.budget_owner === 'person_a') map[k].personA += amt;
    else if (t.budget_owner === 'person_b') map[k].personB += amt;
    else if (t.budget_owner === 'joint') map[k].joint += amt;
  }
  return map;
}

interface Segment {
  key: string;
  amount: number;
  className: string;
  label: string;
}

interface SpendingMoMChartProps {
  transactions: Transaction[];
  /** YYYY-MM oldest → newest */
  monthKeys: string[];
  chartMode: MoMChartMode;
  selectedPerson: 'A' | 'B';
  selectedMonth: string;
  onSelectMonth: (monthYear: string) => void;
  personAName: string;
  personBName: string;
  loading?: boolean;
  chartWindowOffset: number;
  onShiftChartWindow: (delta: number) => void;
}

const MAX_BAR_PX = 168;
const COLOR_PERSON_A = 'bg-[#14B8A6]';
const COLOR_PERSON_B = 'bg-[#0891B2]';
const COLOR_HALF_JOINT = 'bg-[#99F6E4]';
const COLOR_JOINT_FULL = 'bg-[#0D9488]';

export function SpendingMoMChart({
  transactions,
  monthKeys,
  chartMode,
  selectedPerson,
  selectedMonth,
  onSelectMonth,
  personAName,
  personBName,
  loading,
  chartWindowOffset,
  onShiftChartWindow,
}: SpendingMoMChartProps) {
  const buckets = useMemo(
    () => aggregateByMonth(transactions, monthKeys),
    [transactions, monthKeys]
  );

  const rangeLabel = useMemo(() => {
    if (monthKeys.length === 0) return '';
    return `${getMonthYearDisplay(monthKeys[0])} – ${getMonthYearDisplay(monthKeys[monthKeys.length - 1])}`;
  }, [monthKeys]);

  const barData = useMemo(() => {
    return monthKeys.map((m) => {
      const b = buckets[m];
      const halfJ = b.joint / 2;
      let segments: Segment[] = [];
      let total = 0;

      if (chartMode === 'joint') {
        total = b.joint;
        if (b.joint > 0) {
          segments = [
            {
              key: 'joint',
              amount: b.joint,
              className: COLOR_JOINT_FULL,
              label: 'Joint',
            },
          ];
        }
      } else if (chartMode === 'total_share') {
        if (selectedPerson === 'A') {
          total = b.personA + halfJ;
          if (b.personA > 0) {
            segments.push({
              key: 'pa',
              amount: b.personA,
              className: COLOR_PERSON_A,
              label: `${personAName} (personal)`,
            });
          }
          if (halfJ > 0) {
            segments.push({
              key: 'hj-a',
              amount: halfJ,
              className: COLOR_HALF_JOINT,
              label: 'Your half of joint',
            });
          }
        } else {
          total = b.personB + halfJ;
          if (b.personB > 0) {
            segments.push({
              key: 'pb',
              amount: b.personB,
              className: COLOR_PERSON_B,
              label: `${personBName} (personal)`,
            });
          }
          if (halfJ > 0) {
            segments.push({
              key: 'hj-b',
              amount: halfJ,
              className: COLOR_HALF_JOINT,
              label: 'Your half of joint',
            });
          }
        }
      } else {
        if (selectedPerson === 'A') {
          total = b.personA;
          if (b.personA > 0) {
            segments = [
              {
                key: 'pa',
                amount: b.personA,
                className: COLOR_PERSON_A,
                label: `${personAName} (personal)`,
              },
            ];
          }
        } else {
          total = b.personB;
          if (b.personB > 0) {
            segments = [
              {
                key: 'pb',
                amount: b.personB,
                className: COLOR_PERSON_B,
                label: `${personBName} (personal)`,
              },
            ];
          }
        }
      }

      return { month: m, segments, total };
    });
  }, [
    buckets,
    monthKeys,
    chartMode,
    selectedPerson,
    personAName,
    personBName,
  ]);

  const maxTotal = useMemo(
    () => Math.max(...barData.map((d) => d.total), 1),
    [barData]
  );

  if (loading) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl border border-gray-100 bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-gray-900">Spending by month</h3>
          <p className="text-xs text-gray-500">
            Categorized spending only. Tap a bar to open that month&apos;s budget.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            type="button"
            aria-label="Older months"
            disabled={chartWindowOffset >= CHART_MONTH_MAX_OFFSET}
            onClick={() => onShiftChartWindow(1)}
            className="rounded-md p-1 text-gray-600 transition-colors hover:bg-white hover:text-gray-900 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="max-w-[7rem] truncate px-1 text-center text-[10px] font-medium text-gray-600 sm:max-w-none sm:text-xs">
            {rangeLabel}
          </span>
          <button
            type="button"
            aria-label="Newer months"
            disabled={chartWindowOffset <= 0}
            onClick={() => onShiftChartWindow(-1)}
            className="rounded-md p-1 text-gray-600 transition-colors hover:bg-white hover:text-gray-900 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex items-end justify-between gap-1 sm:gap-1.5 overflow-x-auto pb-1 pt-2">
        {barData.map(({ month, segments, total }) => {
          const barHeight =
            maxTotal > 0 && total > 0
              ? Math.max((total / maxTotal) * MAX_BAR_PX, 6)
              : total > 0
                ? 6
                : 2;
          const isSelected = month === selectedMonth;

          return (
            <button
              key={month}
              type="button"
              onClick={() => onSelectMonth(month)}
              className={`flex min-w-[2.25rem] flex-1 flex-col items-center rounded-lg px-0.5 pb-1 pt-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6] ${
                isSelected ? 'bg-teal-50 ring-2 ring-[#14B8A6] ring-offset-1' : 'hover:bg-gray-50'
              }`}
            >
              <div
                className="relative flex w-full flex-col justify-end"
                style={{ height: MAX_BAR_PX }}
              >
                <div
                  className="relative mx-auto flex w-[85%] max-w-[2.75rem] flex-col-reverse overflow-hidden rounded-t-md shadow-sm"
                  style={{ height: barHeight, minHeight: total > 0 ? 6 : 2 }}
                >
                  {segments.length === 0 ? (
                    <div className="min-h-[2px] w-full flex-1 bg-gray-200" />
                  ) : (
                    segments.map((seg) => (
                      <div
                        key={seg.key}
                        className={`${seg.className} w-full min-h-[3px]`}
                        style={{ flex: Math.max(seg.amount, 0.0001) }}
                        title={`${seg.label}: ${formatCurrency(seg.amount)}`}
                      />
                    ))
                  )}
                </div>
              </div>
              <span
                className={`mt-1 text-[10px] sm:text-xs ${isSelected ? 'font-semibold text-[#0D9488]' : 'text-gray-500'}`}
              >
                {shortMonthLabel(month)}
              </span>
            </button>
          );
        })}
      </div>

      {chartMode === 'total_share' && (
        <div className="mt-3 flex flex-wrap gap-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-2.5 w-2.5 rounded-sm ${selectedPerson === 'A' ? COLOR_PERSON_A : COLOR_PERSON_B}`}
            />
            {selectedPerson === 'A' ? personAName : personBName} (personal)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${COLOR_HALF_JOINT}`} />
            Your half of joint
          </span>
        </div>
      )}
      {chartMode === 'joint' && (
        <div className="mt-3 flex flex-wrap gap-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${COLOR_JOINT_FULL}`} />
            Full joint spending
          </span>
        </div>
      )}
      {chartMode === 'personal' && (
        <div className="mt-3 flex flex-wrap gap-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-2.5 w-2.5 rounded-sm ${selectedPerson === 'A' ? COLOR_PERSON_A : COLOR_PERSON_B}`}
            />
            {selectedPerson === 'A' ? personAName : personBName} — personal only
          </span>
        </div>
      )}
    </div>
  );
}
