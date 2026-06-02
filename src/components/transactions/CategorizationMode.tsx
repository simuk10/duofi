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
import { Check, ChevronDown, X } from 'lucide-react';
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
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [initialTotal, setInitialTotal] = useState(0);
  const sessionActiveRef = useRef(false);

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
    }
  }, [isOpen, queue]);

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
      } catch (error) {
        console.error('Failed to save category:', error);
      } finally {
        setSaving(false);
      }
    },
    [current, onCategorize, saving]
  );

  const handleAccept = () => {
    if (!current) return;
    void saveAndAdvance(current.guess.categoryId);
  };

  const handleReject = () => {
    setPhase('pick-category');
    setPickCategoryId('');
  };

  const handlePointerDown = (clientX: number) => setTouchStartX(clientX);

  const handlePointerMove = (clientX: number) => {
    if (touchStartX === null || phase !== 'card') return;
    setDragX(clientX - touchStartX);
  };

  const handlePointerUp = () => {
    if (touchStartX === null || phase !== 'card') return;
    if (dragX > 80) void handleAccept();
    else if (dragX < -80) handleReject();
    setTouchStartX(null);
    setDragX(0);
  };

  if (!isOpen) return null;

  if (remaining.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-[#14B8A6]/10 to-white px-6">
        <div className="max-w-sm text-center">
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
  const cardRotate = Math.max(-12, Math.min(12, dragX / 20));
  const acceptOpacity = Math.min(1, Math.max(0, dragX / 80));
  const rejectOpacity = Math.min(1, Math.max(0, -dragX / 80));
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

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
                className="pointer-events-none absolute inset-0 flex items-center justify-between px-4"
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
                className="relative rounded-2xl border border-gray-200 bg-white p-5 shadow-lg touch-pan-y"
                style={{
                  transform: `translateX(${dragX}px) rotate(${cardRotate}deg)`,
                  transition: touchStartX === null ? 'transform 0.2s ease-out' : 'none',
                }}
                onTouchStart={(e) => handlePointerDown(e.touches[0].clientX)}
                onTouchMove={(e) => handlePointerMove(e.touches[0].clientX)}
                onTouchEnd={handlePointerUp}
                onMouseDown={(e) => handlePointerDown(e.clientX)}
                onMouseMove={(e) => {
                  if (e.buttons === 1) handlePointerMove(e.clientX);
                }}
                onMouseUp={handlePointerUp}
                onMouseLeave={() => {
                  if (touchStartX !== null) handlePointerUp();
                }}
              >
                <p className="text-lg font-medium text-gray-900 leading-snug">{tx.description}</p>
                <p className="mt-2 text-sm text-gray-500">{formatDate(tx.date)}</p>
                <p className="mt-3 text-2xl font-semibold text-gray-900">
                  {formatCurrency(tx.amount)}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {tx.credit_card?.name ?? 'Unknown card'}
                </p>

                <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50/90 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-800/80">
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

            <p className="mb-4 text-center text-xs text-gray-500">
              Swipe right if the category is correct · left to pick a different one
            </p>

            <div className="flex w-full max-w-sm items-center justify-center gap-8">
              <button
                type="button"
                disabled={saving}
                onClick={handleReject}
                className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-200 bg-white text-red-500 shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
                aria-label="Wrong category"
              >
                <X className="h-8 w-8" />
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleAccept()}
                className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-300 bg-emerald-500 text-white shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
                aria-label="Correct category"
              >
                <Check className="h-8 w-8" />
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
