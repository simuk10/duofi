'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { categoryIconToEmoji } from '@/lib/category-icons';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  X,
} from 'lucide-react';
import type { BudgetOwner, Category, Transaction } from '@/types/database';

interface BudgetOwnerReviewModeProps {
  isOpen: boolean;
  onClose: () => void;
  queue: Transaction[];
  categories: Category[];
  personAName: string;
  personBName: string;
  onAssignOwner: (payload: { id: string; budget_owner: BudgetOwner }) => Promise<void>;
  onDefer: (id: string) => void;
}

const SWIPE_THRESHOLD = 72;

export function BudgetOwnerReviewMode({
  isOpen,
  onClose,
  queue,
  categories,
  personAName,
  personBName,
  onAssignOwner,
  onDefer,
}: BudgetOwnerReviewModeProps) {
  const [remaining, setRemaining] = useState<Transaction[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [pointerOrigin, setPointerOrigin] = useState<{ x: number; y: number } | null>(
    null
  );
  const [initialTotal, setInitialTotal] = useState(0);
  const sessionActiveRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      sessionActiveRef.current = false;
      return;
    }
    if (!sessionActiveRef.current) {
      sessionActiveRef.current = true;
      setRemaining(queue);
      setInitialTotal(queue.length);
      setDragX(0);
      setDragY(0);
    }
  }, [isOpen, queue]);

  const current = remaining[0];
  const total = initialTotal || queue.length;
  const done = total - remaining.length;

  const categoryName = current?.category_id
    ? categories.find((c) => c.id === current.category_id)?.name
    : undefined;
  const categoryIcon = current?.category_id
    ? categories.find((c) => c.id === current.category_id)?.icon
    : undefined;

  const advance = useCallback(() => {
    setRemaining((prev) => prev.slice(1));
    setDragX(0);
    setDragY(0);
  }, []);

  const assignAndAdvance = useCallback(
    async (owner: BudgetOwner) => {
      if (!current || saving) return;
      setSaving(true);
      try {
        await onAssignOwner({ id: current.id, budget_owner: owner });
        advance();
      } finally {
        setSaving(false);
      }
    },
    [advance, current, onAssignOwner, saving]
  );

  const deferAndAdvance = useCallback(() => {
    if (!current || saving) return;
    onDefer(current.id);
    advance();
  }, [advance, current, onDefer, saving]);

  const resolveSwipe = useCallback(() => {
    const ax = Math.abs(dragX);
    const ay = Math.abs(dragY);
    if (ax < SWIPE_THRESHOLD && ay < SWIPE_THRESHOLD) return;

    if (ax >= ay) {
      if (dragX > SWIPE_THRESHOLD) void assignAndAdvance('person_a');
      else if (dragX < -SWIPE_THRESHOLD) void assignAndAdvance('person_b');
    } else {
      if (dragY < -SWIPE_THRESHOLD) void assignAndAdvance('joint');
      else if (dragY > SWIPE_THRESHOLD) deferAndAdvance();
    }
  }, [assignAndAdvance, deferAndAdvance, dragX, dragY]);

  const handlePointerDown = (x: number, y: number) => {
    setPointerOrigin({ x, y });
  };

  const handlePointerMove = (x: number, y: number) => {
    if (!pointerOrigin) return;
    setDragX(x - pointerOrigin.x);
    setDragY(y - pointerOrigin.y);
  };

  const handlePointerUp = () => {
    resolveSwipe();
    setPointerOrigin(null);
    if (Math.abs(dragX) < SWIPE_THRESHOLD && Math.abs(dragY) < SWIPE_THRESHOLD) {
      setDragX(0);
      setDragY(0);
    }
  };

  if (!isOpen) return null;

  if (remaining.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 px-6 backdrop-blur-[2px]">
        <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-100">
            <Check className="h-8 w-8 text-sky-600" />
          </div>
          <h2 className="text-xl font-medium text-gray-900">Owners assigned</h2>
          <p className="mt-2 text-sm text-gray-600">
            {total === 0
              ? 'No transactions waiting for an owner.'
              : `You assigned owners for ${done} transaction${done === 1 ? '' : 's'}.`}
          </p>
          <Button className="mt-6 w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  const tx = current;
  const cardRotate = Math.max(-10, Math.min(10, dragX / 24));
  const personAOpacity = Math.min(1, Math.max(0, dragX / SWIPE_THRESHOLD));
  const personBOpacity = Math.min(1, Math.max(0, -dragX / SWIPE_THRESHOLD));
  const jointOpacity = Math.min(1, Math.max(0, -dragY / SWIPE_THRESHOLD));
  const laterOpacity = Math.min(1, Math.max(0, dragY / SWIPE_THRESHOLD));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-sky-50/80 to-white">
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          aria-label="Close owner review"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Budget owner review
          </p>
          <p className="text-sm text-gray-800">
            {done + 1} of {total}
          </p>
        </div>
        <div className="w-9" aria-hidden />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8 pt-2">
        <div className="relative mb-4 w-full max-w-sm aspect-[4/5] max-h-[420px]">
          {/* Direction hints */}
          <div
            className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-lg border-2 border-violet-300 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700"
            style={{ opacity: jointOpacity }}
          >
            Joint ↑
          </div>
          <div
            className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-lg border-2 border-gray-300 bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600"
            style={{ opacity: laterOpacity }}
          >
            Later ↓
          </div>
          <div
            className="pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-lg border-2 border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800"
            style={{ opacity: personBOpacity }}
          >
            {personBName}
          </div>
          <div
            className="pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-lg border-2 border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800"
            style={{ opacity: personAOpacity }}
          >
            {personAName}
          </div>

          <div
            className="absolute inset-x-4 top-12 bottom-12 rounded-2xl border border-gray-200 bg-white p-5 shadow-xl touch-none select-none"
            style={{
              transform: `translate(${dragX}px, ${dragY}px) rotate(${cardRotate}deg)`,
              transition: pointerOrigin === null ? 'transform 0.2s ease-out' : 'none',
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
            <p className="text-lg font-medium leading-snug text-gray-900">{tx.description}</p>
            <p className="mt-2 text-sm text-gray-500">{formatDate(tx.date)}</p>
            <p className="mt-3 text-2xl font-semibold text-gray-900">
              {formatCurrency(tx.amount)}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {tx.credit_card?.name ?? 'Unknown card'} · paid by{' '}
              {tx.paid_by === 'person_a'
                ? personAName
                : tx.paid_by === 'person_b'
                  ? personBName
                  : 'Joint'}
            </p>

            {categoryName && (
              <div className="mt-5 rounded-xl border border-sky-100 bg-sky-50/90 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-sky-800/70">
                  Category
                </p>
                <p className="mt-1 text-base font-medium text-gray-900">
                  {categoryIconToEmoji(categoryIcon, categoryName)} {categoryName}
                </p>
                <p className="mt-2 text-xs text-gray-600">
                  Who should this expense count toward?
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="mb-5 max-w-xs text-center text-xs text-gray-500">
          Swipe → {personAName} · ← {personBName} · ↑ Joint · ↓ review later
        </p>

        <div className="grid w-full max-w-sm grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            disabled={saving}
            onClick={() => void assignAndAdvance('person_b')}
            className="flex flex-col items-center gap-1 rounded-xl border border-blue-200 bg-blue-50/80 py-3 text-xs font-medium text-blue-800 transition active:scale-95 disabled:opacity-50"
          >
            <ArrowLeft className="h-5 w-5" />
            {personBName}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={deferAndAdvance}
            className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 py-3 text-xs font-medium text-gray-600 transition active:scale-95 disabled:opacity-50"
          >
            <ArrowDown className="h-5 w-5" />
            Later
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void assignAndAdvance('joint')}
            className="flex flex-col items-center gap-1 rounded-xl border border-violet-200 bg-violet-50/80 py-3 text-xs font-medium text-violet-800 transition active:scale-95 disabled:opacity-50"
          >
            <ArrowUp className="h-5 w-5" />
            Joint
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void assignAndAdvance('person_a')}
            className="flex flex-col items-center gap-1 rounded-xl border border-blue-200 bg-blue-50/80 py-3 text-xs font-medium text-blue-800 transition active:scale-95 disabled:opacity-50"
          >
            <ArrowRight className="h-5 w-5" />
            {personAName}
          </button>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void assignAndAdvance('joint')}
          className="mt-2 flex w-full max-w-sm items-center justify-center gap-1 rounded-xl border border-violet-100 py-2 text-xs text-violet-700 hover:bg-violet-50 disabled:opacity-50 sm:hidden"
        >
          <ArrowUp className="h-4 w-4" />
          Swipe up for Joint
        </button>
      </div>
    </div>
  );
}
