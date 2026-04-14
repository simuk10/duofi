'use client';

import { useEffect, useState, useMemo } from 'react';
import { useTransactions } from '@/hooks';
import { Modal } from '@/components/ui';
import {
  readImportProgress,
  clearImportProgress,
  type ImportProgressPayload,
  hasCelebratedMonth,
  markMonthCelebrated,
} from '@/lib/gamification';
import { getMonthYearDisplay } from '@/lib/utils';
import { X } from 'lucide-react';

interface ImportProgressRingProps {
  householdId: string | null;
  onJumpToMonth: (monthYear: string) => void;
}

const R = 40;
const STROKE = 5;
const C = 2 * Math.PI * R;

export function ImportProgressRing({
  householdId,
  onJumpToMonth,
}: ImportProgressRingProps) {
  const [stored, setStored] = useState<ImportProgressPayload | null>(null);
  const [celebrateOpen, setCelebrateOpen] = useState(false);

  useEffect(() => {
    if (!householdId) return;
    setStored(readImportProgress());
  }, [householdId]);

  const active = !!stored && !!householdId;

  const { transactions, loading } = useTransactions({
    householdId: active ? householdId : null,
    filter: 'all',
    monthYear: stored?.monthYear,
  });

  const { total, categorized, pct, isComplete } = useMemo(() => {
    if (!stored) {
      return { total: 0, categorized: 0, pct: 0, isComplete: false };
    }
    const t = transactions.length;
    const c = transactions.filter((x) => x.is_categorized).length;
    const p = t > 0 ? Math.round((c / t) * 100) : 0;
    const complete = t > 0 && c === t;
    return { total: t, categorized: c, pct: p, isComplete: complete };
  }, [transactions, stored]);

  useEffect(() => {
    if (!stored || !isComplete || total === 0) return;
    if (hasCelebratedMonth(stored.monthYear)) return;
    markMonthCelebrated(stored.monthYear);
    setCelebrateOpen(true);
  }, [stored, isComplete, total]);

  const dismiss = () => {
    clearImportProgress();
    setStored(null);
  };

  const offset = C - (pct / 100) * C;

  if (!householdId || !stored) return null;

  return (
    <>
      <div className="mx-4 mb-3 rounded-2xl border border-[#14B8A6]/30 bg-gradient-to-br from-teal-50 to-cyan-50 p-4 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="relative h-[calc(2*40px+2*8px)] w-[calc(2*40px+2*8px)] flex-shrink-0">
            <svg
              width={2 * (R + STROKE) + 8}
              height={2 * (R + STROKE) + 8}
              className="-rotate-90"
            >
              <circle
                cx={(R + STROKE) + 4}
                cy={(R + STROKE) + 4}
                r={R}
                fill="none"
                stroke="#e5e7eb"
                strokeWidth={STROKE}
              />
              <circle
                cx={(R + STROKE) + 4}
                cy={(R + STROKE) + 4}
                r={R}
                fill="none"
                stroke="#14B8A6"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={loading ? C : offset}
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold text-[#0D9488]">{loading ? '…' : `${pct}%`}</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Bulk categorization
                </p>
                <p className="mt-0.5 text-xs text-gray-600">
                  {getMonthYearDisplay(stored.monthYear)} ·{' '}
                  <span className="font-medium text-gray-800">
                    {loading ? '…' : `${categorized} / ${total}`}
                  </span>{' '}
                  categorized
                  {stored.fullyCategorizedOnImport && (
                    <span className="block text-[11px] text-teal-700 mt-1">
                      Import included categories — keep going if you add more txns this month.
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-full p-1 text-gray-400 hover:bg-white/80 hover:text-gray-600"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onJumpToMonth(stored.monthYear);
                }}
                className="rounded-lg bg-[#14B8A6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0D9488]"
              >
                Open {getMonthYearDisplay(stored.monthYear)}
              </button>
              {isComplete && (
                <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800">
                  Month closed ✓
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={celebrateOpen}
        onClose={() => setCelebrateOpen(false)}
        title="Month closed!"
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
            🎉
          </div>
          <p className="text-sm text-gray-600">
            Every transaction in{' '}
            <span className="font-semibold text-gray-900">
              {getMonthYearDisplay(stored.monthYear)}
            </span>{' '}
            is categorized. Nice work finishing this batch.
          </p>
          <button
            type="button"
            onClick={() => setCelebrateOpen(false)}
            className="w-full rounded-xl bg-[#14B8A6] py-3 text-sm font-medium text-white hover:bg-[#0D9488]"
          >
            Continue
          </button>
        </div>
      </Modal>
    </>
  );
}
