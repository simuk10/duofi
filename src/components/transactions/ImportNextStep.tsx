'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import type { Transaction } from '@/types/database';
import type { MonthTransactionStats } from '@/hooks/useTransactionMonthStats';
import { buildMonthTransactionStats } from '@/hooks/useTransactionMonthStats';
import {
  clearImportProgress,
  hasCelebratedMonth,
  markMonthCelebrated,
  readImportProgress,
  type ImportProgressPayload,
} from '@/lib/gamification';
import { cn, getMonthYearDisplay, getPreviousMonths } from '@/lib/utils';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';

const COIN_MONTH_DEPTH = 24;
const COIN_SCROLL_STEP = 128;

interface ImportNextStepProps {
  householdId: string | null;
  selectedMonth: string;
  coinStatsTransactions: Transaction[];
  coinStatsLoading: boolean;
  getHighConfidenceCount: (monthYear: string) => number;
  getSwipeModeCount: (monthYear: string) => number;
  getAllSwipeModeCount: () => number;
  getOwnerReviewCount: (monthYear: string) => number;
  onSelectMonth: (monthYear: string) => void;
  onReviewHighConfidence: (monthYear: string) => void;
  onStartCategorizationMode: (monthYear: string) => void;
  onStartCategorizationModeAll: () => void;
  onStartOwnerReview: (monthYear: string) => void;
}

function pickContinueMonth(
  byMonth: Record<string, MonthTransactionStats>,
  monthKeys: string[],
  selectedMonth: string,
  importMonth: string | null,
  importNeedsContinue: boolean
): string | null {
  if (selectedMonth) {
    const selected = byMonth[selectedMonth];
    if (selected && selected.uncategorized > 0) return selectedMonth;
  }
  if (importNeedsContinue && importMonth) {
    const imported = byMonth[importMonth];
    if (imported && imported.uncategorized > 0) return importMonth;
  }
  for (const m of monthKeys) {
    const s = byMonth[m];
    if (s && s.uncategorized > 0) return m;
  }
  return null;
}

function monthAbbrev(monthYear: string): string {
  return getMonthYearDisplay(monthYear).split(' ')[0] ?? monthYear;
}

function MonthCoin({
  monthYear,
  stats,
  selected,
  focused,
  loading,
  onClick,
}: {
  monthYear: string;
  stats: MonthTransactionStats;
  selected: boolean;
  focused: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const complete = stats.total > 0 && stats.uncategorized === 0;
  const fill =
    stats.total > 0
      ? complete
        ? 100
        : Math.round((stats.withCategory / stats.total) * 100)
      : 0;
  const label = monthAbbrev(monthYear);
  const yearLabel = monthYear.slice(0, 4);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        'flex shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition-colors',
        'hover:bg-gray-50 disabled:opacity-60',
        selected && 'bg-teal-50/80 ring-2 ring-inset ring-[#14B8A6]/50',
        focused && !selected && 'ring-2 ring-inset ring-amber-300/90'
      )}
      title={`${getMonthYearDisplay(monthYear)} — ${stats.categorized} of ${stats.total} categorized`}
      aria-label={`${getMonthYearDisplay(monthYear)}, ${stats.categorized} of ${stats.total} categorized${
        focused ? ', next to work on' : ''
      }`}
    >
      <div
        className={cn(
          'relative h-9 w-9 overflow-hidden rounded-full border-2 bg-gray-100',
          complete ? 'border-amber-300' : 'border-gray-200'
        )}
      >
        {loading ? (
          <div className="absolute inset-0 animate-pulse bg-gray-200" />
        ) : (
          <>
            <div
              className={cn(
                'absolute bottom-0 left-0 right-0 transition-all duration-500',
                complete ? 'bg-amber-400' : 'bg-[#14B8A6]'
              )}
              style={{ height: `${fill}%` }}
            />
            {complete && (
              <Check
                className="absolute inset-0 m-auto h-4 w-4 text-amber-900/70"
                strokeWidth={3}
                aria-hidden
              />
            )}
          </>
        )}
      </div>
      <span className="text-[10px] font-medium leading-none text-gray-700">{label}</span>
      <span className="text-[8px] leading-none text-gray-400 tabular-nums">{yearLabel}</span>
    </button>
  );
}

function MonthCoinsRow({
  months,
  byMonth,
  selectedMonth,
  focusedMonth,
  loading,
  onSelectMonth,
}: {
  months: string[];
  byMonth: Record<string, MonthTransactionStats>;
  selectedMonth: string;
  focusedMonth: string | null;
  loading: boolean;
  onSelectMonth: (monthYear: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(maxScroll > 4 && el.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollButtons();
    el.addEventListener('scroll', updateScrollButtons, { passive: true });
    const observer = new ResizeObserver(updateScrollButtons);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollButtons);
      observer.disconnect();
    };
  }, [months.length, loading, updateScrollButtons]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || loading) return;
    el.scrollLeft = el.scrollWidth;
    updateScrollButtons();
  }, [months.length, loading, updateScrollButtons]);

  const scrollCoins = (direction: 'older' | 'newer') => {
    scrollRef.current?.scrollBy({
      left: direction === 'older' ? -COIN_SCROLL_STEP : COIN_SCROLL_STEP,
      behavior: 'smooth',
    });
  };

  if (months.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => scrollCoins('older')}
        disabled={!canScrollLeft || loading}
        className="flex shrink-0 items-center justify-center self-center rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-30"
        aria-label="Older months"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <div
        ref={scrollRef}
        className="min-w-0 flex-1 overflow-x-auto overflow-y-visible py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Monthly categorization progress"
      >
        <div className="flex w-max min-w-full gap-1 px-1">
          {months.map((m) => (
            <MonthCoin
              key={m}
              monthYear={m}
              stats={byMonth[m] ?? { total: 0, categorized: 0, uncategorized: 0, withCategory: 0 }}
              selected={m === selectedMonth}
              focused={m === focusedMonth}
              loading={loading}
              onClick={() => onSelectMonth(m)}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => scrollCoins('newer')}
        disabled={!canScrollRight || loading}
        className="flex shrink-0 items-center justify-center self-center rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-30"
        aria-label="Newer months"
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

export function ImportNextStep({
  householdId,
  selectedMonth,
  coinStatsTransactions,
  coinStatsLoading,
  getHighConfidenceCount,
  getSwipeModeCount,
  getAllSwipeModeCount,
  getOwnerReviewCount,
  onSelectMonth,
  onReviewHighConfidence,
  onStartCategorizationMode,
  onStartCategorizationModeAll,
  onStartOwnerReview,
}: ImportNextStepProps) {
  const monthKeys = useMemo(() => getPreviousMonths(COIN_MONTH_DEPTH), []);
  const byMonth = useMemo(
    () => buildMonthTransactionStats(coinStatsTransactions, monthKeys),
    [coinStatsTransactions, monthKeys]
  );
  const statsLoading = coinStatsLoading;

  const [importProgress, setImportProgress] = useState<ImportProgressPayload | null>(
    null
  );
  const [celebrateOpen, setCelebrateOpen] = useState(false);

  useEffect(() => {
    if (!householdId) return;
    setImportProgress(readImportProgress());
  }, [householdId]);

  const catchUp = useMemo(() => {
    let monthsWithData = 0;
    let monthsDone = 0;
    let monthsNeedWork = 0;
    let uncategorizedTx = 0;

    for (const m of monthKeys) {
      const s = byMonth[m];
      if (!s || s.total === 0) continue;
      monthsWithData += 1;
      uncategorizedTx += s.uncategorized;
      if (s.uncategorized === 0) monthsDone += 1;
      else monthsNeedWork += 1;
    }

    return { monthsWithData, monthsDone, monthsNeedWork, uncategorizedTx };
  }, [byMonth, monthKeys]);

  const monthsWithData = useMemo(
    () =>
      [...monthKeys]
        .reverse()
        .filter((m) => (byMonth[m]?.total ?? 0) > 0),
    [monthKeys, byMonth]
  );

  const importMonth = importProgress?.monthYear ?? null;
  const importStats = importMonth ? byMonth[importMonth] : null;
  const importNeedsContinue =
    !!importProgress &&
    !!importMonth &&
    (importStats?.uncategorized ?? 0) > 0;

  const importComplete = importStats
    ? importStats.uncategorized === 0 && importStats.total > 0
    : false;

  useEffect(() => {
    if (!importProgress || !importMonth) return;
    const s = byMonth[importMonth];
    if (!statsLoading && (!s || s.uncategorized === 0)) {
      clearImportProgress();
      setImportProgress(null);
    }
  }, [importProgress, importMonth, byMonth, statsLoading]);

  useEffect(() => {
    if (!importMonth || !importComplete) return;
    if (hasCelebratedMonth(importMonth)) return;
    markMonthCelebrated(importMonth);
    setCelebrateOpen(true);
    clearImportProgress();
    setImportProgress(null);
  }, [importMonth, importComplete]);

  const continueMonth = useMemo(
    () =>
      pickContinueMonth(
        byMonth,
        monthKeys,
        selectedMonth,
        importMonth,
        importNeedsContinue
      ),
    [byMonth, monthKeys, selectedMonth, importMonth, importNeedsContinue]
  );

  const targetMonth = continueMonth ?? selectedMonth;
  const targetHighConfidence = targetMonth ? getHighConfidenceCount(targetMonth) : 0;
  const targetOwnerReview = targetMonth ? getOwnerReviewCount(targetMonth) : 0;
  const selectedSwipeMode = selectedMonth ? getSwipeModeCount(selectedMonth) : 0;
  const allSwipeMode = getAllSwipeModeCount();

  const allCaughtUp =
    catchUp.monthsWithData > 0 && catchUp.monthsNeedWork === 0;

  const showCategorizeButtons = selectedSwipeMode > 0 || allSwipeMode > 0;
  const showEasyMatches = targetHighConfidence > 0;
  const showOwners = targetOwnerReview > 0;
  const hasAnyAction = showCategorizeButtons || showEasyMatches || showOwners;

  const selectedMonthLabel = selectedMonth ? monthAbbrev(selectedMonth) : 'Month';

  if (!householdId) return null;

  return (
    <>
      <div className="mx-4 mb-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        {allCaughtUp ? (
          <div className="py-1 text-center">
            <p className="text-sm font-medium text-gray-900">All caught up</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {catchUp.monthsDone} of {catchUp.monthsWithData} months fully categorized.
            </p>
            {monthsWithData.length > 0 && (
              <div className="mt-3">
                <MonthCoinsRow
                  months={monthsWithData}
                  byMonth={byMonth}
                  selectedMonth={selectedMonth}
                  focusedMonth={null}
                  loading={statsLoading}
                  onSelectMonth={onSelectMonth}
                />
              </div>
            )}
          </div>
        ) : catchUp.monthsWithData === 0 && !statsLoading ? (
          <div className="py-1 text-center">
            <p className="text-sm font-medium text-gray-900">No imports yet</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Upload a CSV to start tracking catch-up.
            </p>
          </div>
        ) : (
          <>
            {monthsWithData.length > 0 && (
              <div className="mb-3">
                <MonthCoinsRow
                  months={monthsWithData}
                  byMonth={byMonth}
                  selectedMonth={selectedMonth}
                  focusedMonth={continueMonth}
                  loading={statsLoading}
                  onSelectMonth={onSelectMonth}
                />
              </div>
            )}

            <p className="text-xs text-gray-600">
              {statsLoading ? (
                'Loading…'
              ) : catchUp.uncategorizedTx > 0 ? (
                <>
                  <span className="font-medium text-gray-800">
                    {catchUp.uncategorizedTx} left to finish
                  </span>
                  {' across '}
                  {catchUp.monthsNeedWork} month
                  {catchUp.monthsNeedWork === 1 ? '' : 's'}
                </>
              ) : null}
            </p>

            {hasAnyAction && !statsLoading && (
              <div className="mt-3 space-y-2">
                {showCategorizeButtons && (
                  <div className="flex gap-2">
                    <Button
                      className="min-w-0 flex-1 px-2 text-xs sm:text-sm"
                      disabled={selectedSwipeMode === 0}
                      onClick={() => onStartCategorizationMode(selectedMonth)}
                      title={`${selectedSwipeMode} transaction${selectedSwipeMode === 1 ? '' : 's'} ready for swipe categorization in ${getMonthYearDisplay(selectedMonth)}`}
                    >
                      <span className="truncate">
                        Categorize {selectedMonthLabel}
                        {selectedSwipeMode > 0 ? ` (${selectedSwipeMode})` : ''}
                      </span>
                    </Button>
                    <Button
                      className="min-w-0 flex-1 px-2 text-xs sm:text-sm"
                      variant="outline"
                      disabled={allSwipeMode === 0}
                      onClick={onStartCategorizationModeAll}
                      title={`${allSwipeMode} transaction${allSwipeMode === 1 ? '' : 's'} ready for swipe categorization across all months`}
                    >
                      <span className="truncate">
                        Categorize all
                        {allSwipeMode > 0 ? ` (${allSwipeMode})` : ''}
                      </span>
                    </Button>
                  </div>
                )}

                {showEasyMatches && targetMonth && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => onReviewHighConfidence(targetMonth)}
                  >
                    Apply {targetHighConfidence} easy match
                    {targetHighConfidence === 1 ? '' : 'es'}
                  </Button>
                )}

                {showOwners && targetMonth && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => onStartOwnerReview(targetMonth)}
                  >
                    Assign {targetOwnerReview} owner
                    {targetOwnerReview === 1 ? '' : 's'}
                  </Button>
                )}

              </div>
            )}
          </>
        )}
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
              {importMonth ? getMonthYearDisplay(importMonth) : 'this month'}
            </span>{' '}
            is categorized.
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
