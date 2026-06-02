'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { categoryIconToEmoji } from '@/lib/category-icons';
import {
  confidencePercent,
  confidenceTierLabel,
  guessSourceHint,
  type QueuedGuess,
} from '@/lib/categorization-guesses';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Check, ChevronDown, ArrowUp, X } from 'lucide-react';
import type { Category, Transaction } from '@/types/database';

interface CategorizationModeProps {
  isOpen: boolean;
  onClose: () => void;
  queue: QueuedGuess[];
  categories: Category[];
  onCategorize: (payload: { id: string; category_id: string }) => Promise<void>;
  onComplete?: () => void;
}

type Phase = 'card' | 'pick-category';

const SWIPE_THRESHOLD = 72;

export function CategorizationMode({
  isOpen,
  onClose,
  queue,
  categories,
  onCategorize,
  onComplete,
}: CategorizationModeProps) {
  const [remaining, setRemaining] = useState<QueuedGuess[]>([]);
  const [phase, setPhase] = useState<Phase>('card');
  const [pickCategoryId, setPickCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [pointerOrigin, setPointerOrigin] = useState<{ x: number; y: number } | null>(
    null
  );
  const [initialTotal, setInitialTotal] = useState(0);
  const [swipeExit, setSwipeExit] = useState<'left' | 'right' | 'up' | null>(null);
  const sessionActiveRef = useRef(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Initialize once when opened — do not reset when parent queue refetches mid-session
  useEffect(() => {
    if (!isOpen) {
      sessionActiveRef.current = false;
      return;
    }
    if (!sessionActiveRef.current) {
      sessionActiveRef.current = true;
      setRemaining(queue);
      setInitialTotal(queue.length);
      setPhase('card');
      setPickCategoryId('');
      setDragX(0);
      setDragY(0);
      setSwipeExit(null);
    }
  }, [isOpen, queue]);

  useEffect(() => {
    return () => clearTimeout(exitTimerRef.current);
  }, []);

  const current = remaining[0];
  const total = initialTotal || queue.length;
  const done = total - remaining.length;

  const currentCategoryName = useMemo(() => {
    if (!current) return '';
    return categories.find((c) => c.id === current.guess.categoryId)?.name ?? '';
  }, [current, categories]);

  const saveAndAdvance = useCallback(
    async (categoryId: string) => {
      if (!current || saving) return;
      setSaving(true);
      try {
        await onCategorize({
          id: current.transaction.id,
          category_id: categoryId,
        });
        setRemaining((prev) => prev.slice(1));
        setPhase('card');
        setPickCategoryId('');
        setDragX(0);
        setDragY(0);
        setSwipeExit(null);
      } catch (error) {
        console.error('Failed to save category:', error);
        setSwipeExit(null);
        setDragX(0);
        setDragY(0);
      } finally {
        setSaving(false);
      }
    },
    [current, onCategorize, saving]
  );

  const skipAndAdvance = useCallback(() => {
    if (!current || saving) return;
    setRemaining((prev) => prev.slice(1));
    setPhase('card');
    setPickCategoryId('');
    setDragX(0);
    setDragY(0);
    setSwipeExit(null);
  }, [current, saving]);

  const completeSwipe = useCallback(
    (exit: 'left' | 'right' | 'up') => {
      if (exit === 'right') {
        if (current) void saveAndAdvance(current.guess.categoryId);
      } else if (exit === 'left') {
        setPhase('pick-category');
        setPickCategoryId('');
        setDragX(0);
        setDragY(0);
        setSwipeExit(null);
      } else {
        skipAndAdvance();
      }
    },
    [current, saveAndAdvance, skipAndAdvance]
  );

  const triggerSwipeExit = useCallback(
    (exit: 'left' | 'right' | 'up') => {
      if (!current || saving || swipeExit) return;
      setPointerOrigin(null);
      setSwipeExit(exit);
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = setTimeout(() => completeSwipe(exit), 240);
    },
    [completeSwipe, current, saving, swipeExit]
  );

  const handleAccept = () => triggerSwipeExit('right');

  const handleReject = () => triggerSwipeExit('left');

  const resolveSwipe = useCallback(() => {
    if (swipeExit) return;

    const ax = Math.abs(dragX);
    const ay = Math.abs(dragY);
    if (ax < SWIPE_THRESHOLD && ay < SWIPE_THRESHOLD) return;

    if (ax >= ay) {
      if (dragX > SWIPE_THRESHOLD) triggerSwipeExit('right');
      else if (dragX < -SWIPE_THRESHOLD) triggerSwipeExit('left');
    } else if (dragY < -SWIPE_THRESHOLD) {
      triggerSwipeExit('up');
    }
  }, [dragX, dragY, swipeExit, triggerSwipeExit]);

  const handlePointerDown = (x: number, y: number) => {
    if (phase !== 'card') return;
    setPointerOrigin({ x, y });
  };

  const handlePointerMove = (x: number, y: number) => {
    if (!pointerOrigin || phase !== 'card') return;
    setDragX(x - pointerOrigin.x);
    setDragY(y - pointerOrigin.y);
  };

  const handlePointerUp = () => {
    if (phase !== 'card' || swipeExit) return;
    resolveSwipe();
    setPointerOrigin(null);
    if (
      Math.abs(dragX) < SWIPE_THRESHOLD &&
      Math.abs(dragY) < SWIPE_THRESHOLD
    ) {
      setDragX(0);
      setDragY(0);
    }
  };

  if (!isOpen) return null;

  if (remaining.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 px-6 backdrop-blur-[2px]">
        <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-medium text-gray-900">Categories set</h2>
          <p className="mt-2 text-sm text-gray-600">
            {total === 0
              ? 'Nothing to categorize.'
              : `You categorized ${done} transaction${done === 1 ? '' : 's'}. Assign budget owners next.`}
          </p>
          <Button
            className="mt-6 w-full"
            onClick={() => {
              onComplete?.();
              onClose();
            }}
          >
            {onComplete ? 'Assign owners' : 'Done'}
          </Button>
        </div>
      </div>
    );
  }

  const tx = current.transaction;
  const ax = Math.abs(dragX);
  const ay = Math.abs(dragY);
  const horizontalDominant = ax >= ay && ax > 6;
  const acceptTint =
    horizontalDominant && dragX > 0 ? Math.min(1, dragX / SWIPE_THRESHOLD) : 0;
  const rejectTint =
    horizontalDominant && dragX < 0 ? Math.min(1, -dragX / SWIPE_THRESHOLD) : 0;
  const skipTint =
    !horizontalDominant && dragY < 0 ? Math.min(1, -dragY / SWIPE_THRESHOLD) : 0;

  const cardRotate = Math.max(-14, Math.min(14, dragX / 16));
  const acceptOpacity = acceptTint;
  const rejectOpacity = rejectTint;
  const skipOpacity = skipTint;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  const cardScale = swipeExit ? 1 : 1 + Math.max(acceptTint, rejectTint, skipTint) * 0.04;

  let cardTransform = `translate(${dragX}px, ${dragY}px) rotate(${cardRotate}deg) scale(${cardScale})`;
  let cardTransition = pointerOrigin === null ? 'transform 0.2s ease-out' : 'none';

  if (swipeExit === 'right') {
    cardTransform = `translate(calc(100vw + 120px), ${dragY}px) rotate(22deg) scale(1.05)`;
    cardTransition = 'transform 0.24s cubic-bezier(0.34, 1.2, 0.64, 1)';
  } else if (swipeExit === 'left') {
    cardTransform = `translate(calc(-100vw - 120px), ${dragY}px) rotate(-22deg) scale(1.05)`;
    cardTransition = 'transform 0.24s cubic-bezier(0.34, 1.2, 0.64, 1)';
  } else if (swipeExit === 'up') {
    cardTransform = `translate(${dragX}px, calc(-100vh - 120px)) rotate(0deg) scale(0.92)`;
    cardTransition = 'transform 0.24s cubic-bezier(0.34, 1.2, 0.64, 1)';
  }

  const cardBg =
    swipeExit === 'right' || (acceptTint >= rejectTint && acceptTint > skipTint)
      ? `color-mix(in srgb, #ecfdf5 ${Math.round((swipeExit === 'right' ? 1 : acceptTint) * 88)}%, white)`
      : swipeExit === 'left' || (rejectTint > acceptTint && rejectTint > skipTint)
        ? `color-mix(in srgb, #fef2f2 ${Math.round((swipeExit === 'left' ? 1 : rejectTint) * 88)}%, white)`
        : skipTint > 0 || swipeExit === 'up'
          ? `color-mix(in srgb, #f3f4f6 ${Math.round((swipeExit === 'up' ? 1 : skipTint) * 70)}%, white)`
          : '#ffffff';

  const cardBorder =
    acceptTint >= rejectTint && acceptTint > skipTint
      ? `rgba(52, 211, 153, ${0.25 + acceptTint * 0.65})`
      : rejectTint > acceptTint && rejectTint > skipTint
        ? `rgba(248, 113, 113, ${0.25 + rejectTint * 0.65})`
        : skipTint > 0
          ? `rgba(156, 163, 175, ${0.25 + skipTint * 0.45})`
          : 'rgba(229, 231, 235, 1)';

  const cardShadow =
    acceptTint >= rejectTint && acceptTint > skipTint
      ? `0 12px 40px -8px rgba(16, 185, 129, ${0.15 + acceptTint * 0.35})`
      : rejectTint > acceptTint && rejectTint > skipTint
        ? `0 12px 40px -8px rgba(239, 68, 68, ${0.15 + rejectTint * 0.35})`
        : '0 10px 25px -5px rgba(0, 0, 0, 0.08)';

  const suggestionBg =
    acceptTint >= rejectTint && acceptTint > skipTint
      ? `color-mix(in srgb, #d1fae5 ${Math.round(acceptTint * 55)}%, #fffbeb)`
      : rejectTint > acceptTint && rejectTint > skipTint
        ? `color-mix(in srgb, #fee2e2 ${Math.round(rejectTint * 55)}%, #fffbeb)`
        : undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-gray-50 to-white">
      <header className="border-b border-gray-100">
        <div className="px-4 pt-3 pb-2">
          <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
            <span>{done} done</span>
            <span>{progressPct}%</span>
            <span>{remaining.length} left</span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100"
            role="progressbar"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={`Categorization progress: ${done} of ${total} complete`}
          >
            <div
              className="h-full rounded-full bg-[#14B8A6] transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between px-4 pb-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          aria-label="Close categorization mode"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Categorization mode
          </p>
          <p className="text-sm text-gray-800">
            {done + 1} of {total}
          </p>
        </div>
        <div className="w-9" aria-hidden />
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-6 pt-2">
        {phase === 'card' ? (
          <>
            <div className="relative mb-6 w-full max-w-sm">
              <div
                className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-lg border-2 border-gray-300 bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600"
                style={{ opacity: skipOpacity }}
              >
                Skip ↑
              </div>
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-between px-4 pt-8"
                aria-hidden
              >
                <span
                  className="rounded-lg border-2 border-red-300 bg-red-50 px-3 py-1 text-sm font-semibold text-red-600"
                  style={{ opacity: rejectOpacity }}
                >
                  Wrong
                </span>
                <span
                  className="rounded-lg border-2 border-emerald-400 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700"
                  style={{ opacity: acceptOpacity }}
                >
                  Correct
                </span>
              </div>

              <div
                className="relative overflow-hidden rounded-2xl border-2 p-5 shadow-lg touch-none select-none"
                style={{
                  transform: cardTransform,
                  transition: cardTransition,
                  backgroundColor: cardBg,
                  borderColor: swipeExit
                    ? swipeExit === 'right'
                      ? 'rgba(52, 211, 153, 0.9)'
                      : swipeExit === 'left'
                        ? 'rgba(248, 113, 113, 0.9)'
                        : 'rgba(156, 163, 175, 0.7)'
                    : cardBorder,
                  boxShadow: cardShadow,
                }}
                onTouchStart={(e) =>
                  handlePointerDown(e.touches[0].clientX, e.touches[0].clientY)
                }
                onTouchMove={(e) =>
                  handlePointerMove(e.touches[0].clientX, e.touches[0].clientY)
                }
                onTouchEnd={handlePointerUp}
                onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
                onMouseMove={(e) => {
                  if (e.buttons === 1) handlePointerMove(e.clientX, e.clientY);
                }}
                onMouseUp={handlePointerUp}
                onMouseLeave={() => {
                  if (pointerOrigin) handlePointerUp();
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  aria-hidden
                >
                  <Check
                    className="h-24 w-24 text-emerald-500 drop-shadow-sm"
                    strokeWidth={2.5}
                    style={{
                      opacity: swipeExit === 'right' ? 1 : acceptOpacity * 0.95,
                      transform: `scale(${0.85 + acceptOpacity * 0.25})`,
                      transition: pointerOrigin ? 'none' : 'opacity 0.15s, transform 0.15s',
                    }}
                  />
                </div>
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  aria-hidden
                >
                  <X
                    className="h-24 w-24 text-red-500 drop-shadow-sm"
                    strokeWidth={2.5}
                    style={{
                      opacity: swipeExit === 'left' ? 1 : rejectOpacity * 0.95,
                      transform: `scale(${0.85 + rejectOpacity * 0.25})`,
                      transition: pointerOrigin ? 'none' : 'opacity 0.15s, transform 0.15s',
                    }}
                  />
                </div>

                <div className="relative z-[1]">
                <p className="text-lg font-medium text-gray-900 leading-snug">{tx.description}</p>
                <p className="mt-2 text-sm text-gray-500">{formatDate(tx.date)}</p>
                <p className="mt-3 text-2xl font-semibold text-gray-900">
                  {formatCurrency(tx.amount)}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {tx.credit_card?.name ?? 'Unknown card'}
                </p>

                <div
                  className="mt-5 rounded-xl border p-4 transition-colors duration-75"
                  style={{
                    backgroundColor: suggestionBg,
                    borderColor:
                      acceptTint > 0.35
                        ? 'rgba(167, 243, 208, 0.9)'
                        : rejectTint > 0.35
                          ? 'rgba(254, 202, 202, 0.9)'
                          : 'rgba(254, 243, 199, 0.9)',
                  }}
                >
                  <p
                    className="text-xs font-medium uppercase tracking-wide transition-colors duration-75"
                    style={{
                      color:
                        acceptTint > 0.35
                          ? 'rgba(6, 95, 70, 0.85)'
                          : rejectTint > 0.35
                            ? 'rgba(185, 28, 28, 0.85)'
                            : 'rgba(146, 64, 14, 0.8)',
                    }}
                  >
                    Suggested category
                  </p>
                  <p className="mt-1 text-base font-medium text-gray-900">
                    {categoryIconToEmoji(
                      categories.find((c) => c.id === current.guess.categoryId)?.icon,
                      currentCategoryName
                    )}{' '}
                    {currentCategoryName}
                  </p>
                  <p className="mt-2 text-xs text-gray-600">
                    {confidenceTierLabel(current.guess.confidenceTier)} ·{' '}
                    {confidencePercent(current.guess.confidence)}% ·{' '}
                    {guessSourceHint(current.guess.source)}
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    Budget owner comes next in a separate review pass.
                  </p>
                </div>
                </div>
              </div>
            </div>

            <p className="mb-5 max-w-xs text-center text-xs text-gray-500">
              Swipe → Correct · ← Wrong · ↑ Skip
            </p>

            <div className="grid w-full max-w-sm grid-cols-3 gap-2">
              <button
                type="button"
                disabled={saving || !!swipeExit}
                onClick={handleReject}
                className="flex flex-col items-center gap-1 rounded-xl border border-rose-200 bg-rose-50/80 py-3 text-xs font-medium text-rose-800 transition active:scale-95 disabled:opacity-50"
                aria-label="Wrong category"
              >
                <X className="h-5 w-5" />
                Wrong
              </button>
              <button
                type="button"
                disabled={saving || !!swipeExit}
                onClick={() => triggerSwipeExit('up')}
                className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 py-3 text-xs font-medium text-gray-600 transition active:scale-95 disabled:opacity-50"
                aria-label="Skip for now"
              >
                <ArrowUp className="h-5 w-5" />
                Skip
              </button>
              <button
                type="button"
                disabled={saving || !!swipeExit}
                onClick={() => void handleAccept()}
                className="flex flex-col items-center gap-1 rounded-xl border border-teal-200 bg-teal-50/80 py-3 text-xs font-medium text-teal-800 transition active:scale-95 disabled:opacity-50"
                aria-label="Correct category"
              >
                <Check className="h-5 w-5" />
                Correct
              </button>
            </div>
          </>
        ) : (
          <div className="w-full max-w-sm">
            <TransactionSummary tx={tx} />
            <p className="mb-3 text-sm font-medium text-gray-900">Pick the correct category</p>
            <div className="relative mb-4">
              <select
                aria-label="Correct category"
                value={pickCategoryId}
                onChange={(e) => setPickCategoryId(e.target.value)}
                className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-4 pr-10 text-sm text-gray-800"
              >
                <option value="">Select category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryIconToEmoji(c.icon, c.name)} {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
            <p className="mb-4 text-xs text-gray-500">
              Saving category only — you&apos;ll assign the budget owner in the next step.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPhase('card')}>
                Back
              </Button>
              <Button variant="outline" className="flex-1" onClick={skipAndAdvance}>
                Skip
              </Button>
              <Button
                className="flex-1"
                disabled={!pickCategoryId || saving}
                loading={saving}
                onClick={() => void saveAndAdvance(pickCategoryId)}
              >
                Save & next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionSummary({ tx }: { tx: Transaction }) {
  return (
    <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50/80 p-4">
      <p className="text-sm font-medium text-gray-900">{tx.description}</p>
      <p className="mt-1 text-xs text-gray-500">
        {formatDate(tx.date)} · {formatCurrency(tx.amount)}
      </p>
    </div>
  );
}
