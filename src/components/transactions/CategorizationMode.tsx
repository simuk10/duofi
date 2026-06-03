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
import type { CategorizationFlowMode } from '@/lib/categorization-flow-preference';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Undo2,
  X,
} from 'lucide-react';
import type { BudgetOwner, Category, Transaction } from '@/types/database';
import type { CategoryGuess } from '@/lib/categorization-engine';
import {
  computeOwnerSwipeFeedback,
} from '@/components/transactions/owner-swipe-feedback';

interface CategorizationModeProps {
  isOpen: boolean;
  onClose: () => void;
  queue: QueuedGuess[];
  categories: Category[];
  workflowMode: CategorizationFlowMode;
  personAName: string;
  personBName: string;
  onCategorize: (payload: { id: string; category_id: string }) => Promise<void>;
  onCategorizeFull?: (payload: {
    id: string;
    category_id: string;
    budget_owner: BudgetOwner;
  }) => Promise<void>;
  onRevert?: (payload: {
    id: string;
    category_id: string | null;
    budget_owner: BudgetOwner | null;
  }) => Promise<void>;
  onComplete?: () => void;
}

type UndoState =
  | {
      scope: 'in_progress';
      item: QueuedGuess;
      categoryId: string | null;
      budgetOwner: BudgetOwner | null;
    }
  | {
      scope: 'completed';
      item: QueuedGuess;
      categoryId: string | null;
      budgetOwner: BudgetOwner | null;
      dbChanged: boolean;
    };

type Phase = 'category' | 'pick-category' | 'owner' | 'confirm';

type PendingDecision = {
  item: QueuedGuess;
  categoryId: string;
  budgetOwner: BudgetOwner | null;
};

const SWIPE_THRESHOLD = 72;

function ownerDisplayName(
  owner: BudgetOwner,
  personAName: string,
  personBName: string
): string {
  switch (owner) {
    case 'person_a':
      return personAName;
    case 'person_b':
      return personBName;
    case 'joint':
      return 'Joint';
  }
}

export function CategorizationMode({
  isOpen,
  onClose,
  queue,
  categories,
  workflowMode,
  personAName,
  personBName,
  onCategorize,
  onCategorizeFull,
  onRevert,
  onComplete,
}: CategorizationModeProps) {
  const isCombined = workflowMode === 'combined';
  const [remaining, setRemaining] = useState<QueuedGuess[]>([]);
  const [phase, setPhase] = useState<Phase>('category');
  const [pendingCategoryId, setPendingCategoryId] = useState('');
  const [pickCategoryId, setPickCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [pointerOrigin, setPointerOrigin] = useState<{ x: number; y: number } | null>(
    null
  );
  const [initialTotal, setInitialTotal] = useState(0);
  const [swipeExit, setSwipeExit] = useState<'left' | 'right' | 'up' | 'down' | null>(
    null
  );
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);
  const sessionActiveRef = useRef(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const confirmSaveRef = useRef(0);
  const cardOriginalRef = useRef<{
    categoryId: string | null;
    budgetOwner: BudgetOwner | null;
  }>({ categoryId: null, budgetOwner: null });

  const resetDrag = useCallback(() => {
    setDragX(0);
    setDragY(0);
    setSwipeExit(null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      sessionActiveRef.current = false;
      return;
    }
    if (!sessionActiveRef.current) {
      sessionActiveRef.current = true;
      setRemaining(queue);
      setInitialTotal(queue.length);
      setPhase('category');
      setPendingCategoryId('');
      setPickCategoryId('');
      resetDrag();
      setUndo(null);
      setPendingDecision(null);
      confirmSaveRef.current += 1;
    }
  }, [isOpen, queue, resetDrag]);

  useEffect(() => {
    const tx = remaining[0];
    if (!tx) return;
    cardOriginalRef.current = {
      categoryId: tx.transaction.category_id,
      budgetOwner: tx.transaction.budget_owner,
    };
  }, [remaining[0]?.transaction.id]);

  useEffect(() => {
    return () => clearTimeout(exitTimerRef.current);
  }, []);

  const current = remaining[0];
  const total = initialTotal || queue.length;
  const done = total - remaining.length;

  const currentCategoryName = useMemo(() => {
    if (!current) return '';
    const id =
      phase === 'confirm' && pendingDecision
        ? pendingDecision.categoryId
        : phase === 'owner' && pendingCategoryId
          ? pendingCategoryId
          : current.guess.categoryId;
    return categories.find((c) => c.id === id)?.name ?? '';
  }, [categories, current, pendingCategoryId, pendingDecision, phase]);

  const currentCategoryIcon = useMemo(() => {
    if (!current) return undefined;
    const id =
      phase === 'confirm' && pendingDecision
        ? pendingDecision.categoryId
        : phase === 'owner' && pendingCategoryId
          ? pendingCategoryId
          : current.guess.categoryId;
    return categories.find((c) => c.id === id)?.icon;
  }, [categories, current, pendingCategoryId, pendingDecision, phase]);

  const advanceQueue = useCallback(() => {
    setRemaining((prev) => prev.slice(1));
    setPhase('category');
    setPendingCategoryId('');
    setPickCategoryId('');
    resetDrag();
  }, [resetDrag]);

  const pushCompletedUndo = useCallback((item: QueuedGuess, dbChanged: boolean) => {
    const { categoryId, budgetOwner } = cardOriginalRef.current;
    setUndo({
      scope: 'completed',
      item,
      categoryId,
      budgetOwner,
      dbChanged,
    });
  }, []);

  const onCategorizeRef = useRef(onCategorize);
  const onCategorizeFullRef = useRef(onCategorizeFull);
  onCategorizeRef.current = onCategorize;
  onCategorizeFullRef.current = onCategorizeFull;

  const runConfirmSave = useCallback(
    async (decision: PendingDecision) => {
      const saveId = ++confirmSaveRef.current;
      setSaving(true);
      try {
        if (decision.budgetOwner && onCategorizeFullRef.current) {
          await onCategorizeFullRef.current({
            id: decision.item.transaction.id,
            category_id: decision.categoryId,
            budget_owner: decision.budgetOwner,
          });
        } else {
          await onCategorizeRef.current({
            id: decision.item.transaction.id,
            category_id: decision.categoryId,
          });
        }

        if (saveId !== confirmSaveRef.current) return;

        pushCompletedUndo(decision.item, true);
        setPendingDecision(null);
        advanceQueue();
      } catch (error) {
        if (saveId !== confirmSaveRef.current) return;
        console.error('Failed to save categorization:', error);
        setPendingDecision(null);
        setPhase(isCombined ? 'owner' : 'category');
      } finally {
        if (saveId === confirmSaveRef.current) {
          setSaving(false);
        }
      }
    },
    [advanceQueue, isCombined, pushCompletedUndo]
  );

  const handleUndo = useCallback(async () => {
    if (!undo || saving) return;
    setSaving(true);
    try {
      if (undo.scope === 'in_progress') {
        if (phase === 'confirm') {
          confirmSaveRef.current += 1;
          setPendingDecision(null);
          setPhase(isCombined ? 'owner' : 'category');
          resetDrag();
          return;
        }
        if (phase === 'owner') {
          setPhase('category');
          setPendingCategoryId('');
          resetDrag();
          setUndo(null);
          return;
        }
        return;
      }

      if (!onRevert) return;

      if (undo.dbChanged) {
        await onRevert({
          id: undo.item.transaction.id,
          category_id: undo.categoryId,
          budget_owner: undo.budgetOwner,
        });
      }
      setRemaining((prev) => [undo.item, ...prev]);
      setPhase('category');
      setPendingCategoryId('');
      resetDrag();
      setUndo(null);
    } catch (error) {
      console.error('Failed to undo:', error);
    } finally {
      setSaving(false);
    }
  }, [isCombined, onRevert, phase, resetDrag, saving, undo]);

  const showConfirm = useCallback(
    (categoryId: string, budgetOwner: BudgetOwner | null) => {
      if (!current || saving) return;
      const decision: PendingDecision = { item: current, categoryId, budgetOwner };
      setPendingDecision(decision);
      setPhase('confirm');
      resetDrag();
      const { categoryId: origCat, budgetOwner: origOwner } = cardOriginalRef.current;
      setUndo({
        scope: 'in_progress',
        item: current,
        categoryId: origCat,
        budgetOwner: origOwner,
      });
      void runConfirmSave(decision);
    },
    [current, resetDrag, runConfirmSave, saving]
  );

  const goToOwnerStep = useCallback(
    (categoryId: string) => {
      if (!current || saving) return;
      setPendingCategoryId(categoryId);
      setPhase('owner');
      resetDrag();
      const { categoryId: origCat, budgetOwner: origOwner } = cardOriginalRef.current;
      setUndo({
        scope: 'in_progress',
        item: current,
        categoryId: origCat,
        budgetOwner: origOwner,
      });
    },
    [current, resetDrag, saving]
  );

  const resolveCategoryChoice = useCallback(
    (categoryId: string) => {
      if (isCombined) goToOwnerStep(categoryId);
      else showConfirm(categoryId, null);
    },
    [goToOwnerStep, isCombined, showConfirm]
  );

  const skipAndAdvance = useCallback(() => {
    if (!current || saving) return;
    pushCompletedUndo(current, false);
    advanceQueue();
  }, [advanceQueue, current, pushCompletedUndo, saving]);

  const deferOwnerAndAdvance = useCallback(() => {
    if (!current || saving || !pendingCategoryId) return;
    showConfirm(pendingCategoryId, null);
  }, [current, pendingCategoryId, saving, showConfirm]);

  const assignOwnerAndAdvance = useCallback(
    (owner: BudgetOwner) => {
      if (!current || !pendingCategoryId || saving) return;
      showConfirm(pendingCategoryId, owner);
    },
    [current, pendingCategoryId, saving, showConfirm]
  );

  const completeCategorySwipe = useCallback(
    (exit: 'left' | 'right' | 'down') => {
      if (exit === 'right') {
        if (current) resolveCategoryChoice(current.guess.categoryId);
      } else if (exit === 'left') {
        setPhase('pick-category');
        setPickCategoryId('');
        resetDrag();
      } else {
        skipAndAdvance();
      }
    },
    [current, resetDrag, resolveCategoryChoice, skipAndAdvance]
  );

  const triggerCategorySwipeExit = useCallback(
    (exit: 'left' | 'right' | 'down') => {
      if (!current || saving || swipeExit || phase !== 'category') return;
      setPointerOrigin(null);
      setSwipeExit(exit);
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = setTimeout(() => completeCategorySwipe(exit), 240);
    },
    [completeCategorySwipe, current, phase, saving, swipeExit]
  );

  const resolveOwnerSwipe = useCallback(() => {
    if (swipeExit || phase !== 'owner' || saving) return;

    const ax = Math.abs(dragX);
    const ay = Math.abs(dragY);
    if (ax < SWIPE_THRESHOLD && ay < SWIPE_THRESHOLD) return;

    if (ax >= ay) {
      if (dragX > SWIPE_THRESHOLD) assignOwnerAndAdvance('person_a');
      else if (dragX < -SWIPE_THRESHOLD) assignOwnerAndAdvance('person_b');
    } else {
      if (dragY < -SWIPE_THRESHOLD) assignOwnerAndAdvance('joint');
      else if (dragY > SWIPE_THRESHOLD) deferOwnerAndAdvance();
    }
  }, [
    assignOwnerAndAdvance,
    deferOwnerAndAdvance,
    dragX,
    dragY,
    phase,
    saving,
    swipeExit,
  ]);

  const resolveCategorySwipe = useCallback(() => {
    if (swipeExit || phase !== 'category') return;

    const ax = Math.abs(dragX);
    const ay = Math.abs(dragY);
    if (ax < SWIPE_THRESHOLD && ay < SWIPE_THRESHOLD) return;

    if (ax >= ay) {
      if (dragX > SWIPE_THRESHOLD) triggerCategorySwipeExit('right');
      else if (dragX < -SWIPE_THRESHOLD) triggerCategorySwipeExit('left');
    } else if (dragY > SWIPE_THRESHOLD) {
      triggerCategorySwipeExit('down');
    }
  }, [dragX, dragY, phase, swipeExit, triggerCategorySwipeExit]);

  const handlePointerDown = (x: number, y: number) => {
    if (phase === 'pick-category' || phase === 'confirm') return;
    setPointerOrigin({ x, y });
  };

  const handlePointerMove = (x: number, y: number) => {
    if (!pointerOrigin || phase === 'pick-category') return;
    setDragX(x - pointerOrigin.x);
    setDragY(y - pointerOrigin.y);
  };

  const handlePointerUp = () => {
    if (phase === 'pick-category' || phase === 'confirm' || swipeExit) return;
    if (phase === 'category') resolveCategorySwipe();
    else resolveOwnerSwipe();
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
          <h2 className="text-xl font-medium text-gray-900">
            {isCombined ? 'All done' : 'Categories set'}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {total === 0
              ? 'Nothing to categorize.'
              : isCombined
                ? `You finished ${done} transaction${done === 1 ? '' : 's'}.`
                : `You categorized ${done} transaction${done === 1 ? '' : 's'}. Assign budget owners next.`}
          </p>
          <Button
            className="mt-6 w-full"
            onClick={() => {
              onComplete?.();
              onClose();
            }}
          >
            {isCombined ? 'Done' : onComplete ? 'Assign owners' : 'Done'}
          </Button>
        </div>
      </div>
    );
  }

  const tx = current.transaction;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const combinedStep: 'category' | 'owner' | 'confirm' =
    phase === 'owner' ? 'owner' : phase === 'confirm' ? 'confirm' : 'category';
  const sessionQuestion = isCombined
    ? phase === 'confirm'
      ? 'Review your choices'
      : phase === 'owner'
        ? 'Who should this count toward?'
        : phase === 'pick-category'
          ? 'Pick the correct category'
          : 'Is this category right?'
    : phase === 'confirm'
      ? 'Review your choices'
      : phase === 'pick-category'
        ? 'Pick the correct category'
        : 'Is this category right?';
  const sessionAccent: 'teal' | 'blue' =
    phase === 'owner' ? 'blue' : phase === 'confirm' ? 'teal' : 'teal';

  if (phase === 'confirm' && pendingDecision) {
    const confirmTx = pendingDecision.item.transaction;
    const confirmCategoryName =
      categories.find((c) => c.id === pendingDecision.categoryId)?.name ?? '';
    const confirmCategoryIcon = categories.find(
      (c) => c.id === pendingDecision.categoryId
    )?.icon;

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-emerald-50/40 to-white">
        <CategorizationSessionHeader
          accent="teal"
          question={sessionQuestion}
          done={done}
          total={total}
          remaining={remaining.length}
          progressPct={progressPct}
          onClose={onClose}
          isCombined={isCombined}
          combinedStep={combinedStep}
          undoAvailable={
            !!undo && (undo.scope === 'in_progress' || !!onRevert)
          }
          undoDisabled={saving}
          onUndo={() => void handleUndo()}
        />

        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-6 pt-2">
          <ConfirmReviewCard
            tx={confirmTx}
            categoryName={confirmCategoryName}
            categoryIcon={confirmCategoryIcon}
            budgetOwner={pendingDecision.budgetOwner}
            personAName={personAName}
            personBName={personBName}
            saving={saving}
            isCombined={isCombined}
          />
        </div>
      </div>
    );
  }

  if (phase === 'owner') {
    const swipe = computeOwnerSwipeFeedback(dragX, dragY, {
      personAName,
      personBName,
    });
    const suggestedOwner = current.guess.budgetOwner;

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-sky-50/90 to-white">
        <CategorizationSessionHeader
          accent="blue"
          question={sessionQuestion}
          done={done}
          total={total}
          remaining={remaining.length}
          progressPct={progressPct}
          onClose={onClose}
          isCombined={isCombined}
          combinedStep={combinedStep}
          undoAvailable={
            !!undo && (undo.scope === 'in_progress' || !!onRevert)
          }
          undoDisabled={saving}
          onUndo={() => void handleUndo()}
        />

        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-6 pt-2">
          <div className="relative mb-6 w-full max-w-sm">
            <div
              className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between py-1"
              aria-hidden
            >
              <span
                className="mx-auto rounded-lg border-2 border-violet-300 bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700"
                style={{ opacity: swipe.jointOpacity }}
              >
                Joint ↑
              </span>
              <div className="flex items-center justify-between px-4 pt-8">
                <span
                  className="rounded-lg border-2 border-blue-300 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800"
                  style={{ opacity: swipe.personBOpacity }}
                >
                  {personBName}
                </span>
                <span
                  className="rounded-lg border-2 border-blue-300 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800"
                  style={{ opacity: swipe.personAOpacity }}
                >
                  {personAName}
                </span>
              </div>
              <span
                className="mx-auto rounded-lg border-2 border-gray-300 bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600"
                style={{ opacity: swipe.laterOpacity }}
              >
                Later ↓
              </span>
            </div>

            <div
              className="relative overflow-hidden rounded-2xl border-2 bg-white p-5 shadow-lg touch-none select-none"
              style={{
                transform: `translate(${dragX}px, ${dragY}px) rotate(${swipe.cardRotate}deg) scale(${swipe.cardScale})`,
                transition: pointerOrigin === null ? 'transform 0.2s ease-out' : 'none',
                backgroundColor: swipe.cardBg,
                borderColor: swipe.cardBorder,
                boxShadow: swipe.cardShadow,
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
              <TransactionDetailsBlock tx={tx} />

              <CategoryDonePanel
                icon={currentCategoryIcon ?? undefined}
                name={currentCategoryName}
              />

              <OwnerFocusPanel
                suggestedOwner={suggestedOwner}
                personAName={personAName}
                personBName={personBName}
              />
            </div>
          </div>

          <p className="mb-5 max-w-xs text-center text-xs text-gray-500">
            Swipe → {personAName} · ← {personBName} · ↑ Joint · ↓ owner later
          </p>

          <div className="grid w-full max-w-sm grid-cols-3 gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => assignOwnerAndAdvance('person_b')}
              className="flex flex-col items-center gap-1 rounded-xl border border-blue-200 bg-blue-50/80 py-3 text-xs font-medium text-blue-800 transition active:scale-95 disabled:opacity-50"
            >
              <ArrowLeft className="h-5 w-5" />
              {personBName}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={deferOwnerAndAdvance}
              className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 py-3 text-xs font-medium text-gray-600 transition active:scale-95 disabled:opacity-50"
            >
              <ArrowDown className="h-5 w-5" />
              Later
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => assignOwnerAndAdvance('person_a')}
              className="flex flex-col items-center gap-1 rounded-xl border border-blue-200 bg-blue-50/80 py-3 text-xs font-medium text-blue-800 transition active:scale-95 disabled:opacity-50"
            >
              <ArrowRight className="h-5 w-5" />
              {personAName}
            </button>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => assignOwnerAndAdvance('joint')}
            className="mt-2 flex w-full max-w-sm items-center justify-center gap-1 rounded-xl border border-violet-100 py-2 text-xs text-violet-700 hover:bg-violet-50 disabled:opacity-50"
          >
            <ArrowUp className="h-4 w-4" />
            Joint
          </button>
        </div>
      </div>
    );
  }

  const ax = Math.abs(dragX);
  const ay = Math.abs(dragY);
  const horizontalDominant = ax >= ay && ax > 6;
  const acceptTint =
    horizontalDominant && dragX > 0 ? Math.min(1, dragX / SWIPE_THRESHOLD) : 0;
  const rejectTint =
    horizontalDominant && dragX < 0 ? Math.min(1, -dragX / SWIPE_THRESHOLD) : 0;
  const skipTint =
    !horizontalDominant && dragY > 0 ? Math.min(1, dragY / SWIPE_THRESHOLD) : 0;

  const cardRotate = Math.max(-14, Math.min(14, dragX / 16));
  const acceptOpacity = acceptTint;
  const rejectOpacity = rejectTint;
  const skipOpacity = skipTint;

  const cardScale = swipeExit ? 1 : 1 + Math.max(acceptTint, rejectTint, skipTint) * 0.04;

  let cardTransform = `translate(${dragX}px, ${dragY}px) rotate(${cardRotate}deg) scale(${cardScale})`;
  let cardTransition = pointerOrigin === null ? 'transform 0.2s ease-out' : 'none';

  if (swipeExit === 'right') {
    cardTransform = `translate(calc(100vw + 120px), ${dragY}px) rotate(22deg) scale(1.05)`;
    cardTransition = 'transform 0.24s cubic-bezier(0.34, 1.2, 0.64, 1)';
  } else if (swipeExit === 'left') {
    cardTransform = `translate(calc(-100vw - 120px), ${dragY}px) rotate(-22deg) scale(1.05)`;
    cardTransition = 'transform 0.24s cubic-bezier(0.34, 1.2, 0.64, 1)';
  } else if (swipeExit === 'down') {
    cardTransform = `translate(${dragX}px, calc(100vh + 120px)) rotate(0deg) scale(0.92)`;
    cardTransition = 'transform 0.24s cubic-bezier(0.34, 1.2, 0.64, 1)';
  }

  const cardBg =
    swipeExit === 'right' || (acceptTint >= rejectTint && acceptTint > skipTint)
      ? `color-mix(in srgb, #ecfdf5 ${Math.round((swipeExit === 'right' ? 1 : acceptTint) * 88)}%, white)`
      : swipeExit === 'left' || (rejectTint > acceptTint && rejectTint > skipTint)
        ? `color-mix(in srgb, #fef2f2 ${Math.round((swipeExit === 'left' ? 1 : rejectTint) * 88)}%, white)`
        : skipTint > 0 || swipeExit === 'down'
          ? `color-mix(in srgb, #f3f4f6 ${Math.round((swipeExit === 'down' ? 1 : skipTint) * 70)}%, white)`
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
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-gradient-to-b ${
        isCombined ? 'from-teal-50/50 to-white' : 'from-gray-50 to-white'
      }`}
    >
      <CategorizationSessionHeader
        accent={sessionAccent}
        question={sessionQuestion}
        done={done}
        total={total}
        remaining={remaining.length}
        progressPct={progressPct}
        onClose={onClose}
        isCombined={isCombined}
        combinedStep={combinedStep}
        undoAvailable={
          !!undo && (undo.scope === 'in_progress' || !!onRevert)
        }
        undoDisabled={saving}
        onUndo={() => void handleUndo()}
      />

      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-6 pt-2">
        {phase === 'category' ? (
          <>
            <div className="relative mb-6 w-full max-w-sm">
              <div
                className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between py-1"
                aria-hidden
              >
                <div className="h-6" />
                <div className="flex items-center justify-between px-4 pt-8">
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
                <span
                  className="mx-auto rounded-lg border-2 border-gray-300 bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600"
                  style={{ opacity: skipOpacity }}
                >
                  Skip ↓
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
                  <TransactionDetailsBlock tx={tx} />

                  <CategoryFocusPanel
                    categoryIcon={
                      categories.find((c) => c.id === current.guess.categoryId)?.icon
                    }
                    categoryName={currentCategoryName}
                    confidenceTier={current.guess.confidenceTier}
                    confidence={current.guess.confidence}
                    source={current.guess.source}
                    acceptTint={acceptTint}
                    rejectTint={rejectTint}
                    suggestionBg={suggestionBg}
                    footerHint={
                      isCombined
                        ? 'Next step: pick the budget owner.'
                        : 'Budget owner comes next in a separate review pass.'
                    }
                  />
                </div>
              </div>
            </div>

            <p className="mb-5 max-w-xs text-center text-xs text-gray-500">
              Swipe → Correct · ← Wrong · ↓ Skip
            </p>

            <div className="grid w-full max-w-sm grid-cols-3 gap-2">
              <button
                type="button"
                disabled={saving || !!swipeExit}
                onClick={() => triggerCategorySwipeExit('left')}
                className="flex flex-col items-center gap-1 rounded-xl border border-rose-200 bg-rose-50/80 py-3 text-xs font-medium text-rose-800 transition active:scale-95 disabled:opacity-50"
                aria-label="Wrong category"
              >
                <X className="h-5 w-5" />
                Wrong
              </button>
              <button
                type="button"
                disabled={saving || !!swipeExit}
                onClick={() => triggerCategorySwipeExit('down')}
                className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 py-3 text-xs font-medium text-gray-600 transition active:scale-95 disabled:opacity-50"
                aria-label="Skip for now"
              >
                <ArrowDown className="h-5 w-5" />
                Skip
              </button>
              <button
                type="button"
                disabled={saving || !!swipeExit}
                onClick={() => triggerCategorySwipeExit('right')}
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
            {isCombined ? (
              <div className="mb-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <TransactionDetailsBlock tx={tx} />
              </div>
            ) : (
              <TransactionSummary tx={tx} />
            )}
            {!isCombined ? (
              <p className="mb-3 text-sm font-medium text-gray-900">Pick the correct category</p>
            ) : null}
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
              {isCombined
                ? 'You’ll assign the budget owner on the next screen.'
                : 'Saving category only — you’ll assign the budget owner in the next step.'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPhase('category')}>
                Back
              </Button>
              <Button variant="outline" className="flex-1" onClick={skipAndAdvance}>
                Skip
              </Button>
              <Button
                className="flex-1"
                disabled={!pickCategoryId || saving}
                loading={saving}
                onClick={() => resolveCategoryChoice(pickCategoryId)}
              >
                {isCombined ? 'Next' : 'Save & next'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionDetailsBlock({ tx }: { tx: Transaction }) {
  return (
    <>
      <p className="text-lg font-medium leading-snug text-gray-900">{tx.description}</p>
      <p className="mt-2 text-sm text-gray-500">{formatDate(tx.date)}</p>
      <p className="mt-3 text-2xl font-semibold text-gray-900">
        {formatCurrency(tx.amount)}
      </p>
      <p className="mt-1 text-xs text-gray-400">
        {tx.credit_card?.name ?? 'Unknown card'}
      </p>
    </>
  );
}

function CategoryFocusPanel({
  categoryIcon,
  categoryName,
  confidenceTier,
  confidence,
  source,
  acceptTint,
  rejectTint,
  suggestionBg,
  footerHint,
}: {
  categoryIcon: string | null | undefined;
  categoryName: string;
  confidenceTier: CategoryGuess['confidenceTier'];
  confidence: number;
  source: CategoryGuess['source'];
  acceptTint: number;
  rejectTint: number;
  suggestionBg: string | undefined;
  footerHint: string;
}) {
  return (
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
        {categoryIconToEmoji(categoryIcon, categoryName)} {categoryName}
      </p>
      <p className="mt-2 text-xs text-gray-600">
        {confidenceTierLabel(confidenceTier)} · {confidencePercent(confidence)}% ·{' '}
        {guessSourceHint(source)}
      </p>
      <p className="mt-2 text-xs text-gray-500">{footerHint}</p>
    </div>
  );
}

function CategoryDonePanel({
  icon,
  name,
}: {
  icon: string | undefined;
  name: string;
}) {
  return (
    <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-100/90 px-3 py-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
          Category set
        </p>
        <p className="truncate text-sm font-medium text-emerald-950">
          {categoryIconToEmoji(icon, name)} {name}
        </p>
      </div>
    </div>
  );
}

function OwnerFocusPanel({
  suggestedOwner,
  personAName,
  personBName,
}: {
  suggestedOwner: BudgetOwner;
  personAName: string;
  personBName: string;
}) {
  return (
    <div className="mt-5 rounded-xl border-2 border-dashed border-sky-300 bg-sky-50/25 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-sky-800/90">
        Suggested budget owner
      </p>
      <p className="mt-1 text-base font-medium text-gray-900">
        {ownerDisplayName(suggestedOwner, personAName, personBName)}
      </p>
      <p className="mt-2 text-xs text-gray-600">
        Swipe to confirm or pick a different owner.
      </p>
    </div>
  );
}

function OwnerDonePanel({
  owner,
  personAName,
  personBName,
}: {
  owner: BudgetOwner;
  personAName: string;
  personBName: string;
}) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-100/90 px-3 py-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white">
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800">
          Budget owner
        </p>
        <p className="truncate text-sm font-medium text-sky-950">
          {ownerDisplayName(owner, personAName, personBName)}
        </p>
      </div>
    </div>
  );
}

function OwnerDeferredPanel() {
  return (
    <div className="mt-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/80 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        Budget owner
      </p>
      <p className="mt-0.5 text-sm font-medium text-gray-500">Assign later</p>
    </div>
  );
}

function ConfirmReviewCard({
  tx,
  categoryName,
  categoryIcon,
  budgetOwner,
  personAName,
  personBName,
  saving,
  isCombined,
}: {
  tx: Transaction;
  categoryName: string;
  categoryIcon: string | null | undefined;
  budgetOwner: BudgetOwner | null;
  personAName: string;
  personBName: string;
  saving: boolean;
  isCombined: boolean;
}) {
  return (
    <div className="w-full max-w-sm">
      <div className="rounded-2xl border-2 border-emerald-200 bg-white p-5 shadow-lg">
        <TransactionDetailsBlock tx={tx} />

        <CategoryDonePanel icon={categoryIcon ?? undefined} name={categoryName} />

        {budgetOwner ? (
          <OwnerDonePanel
            owner={budgetOwner}
            personAName={personAName}
            personBName={personBName}
          />
        ) : (
          <OwnerDeferredPanel />
        )}

        <div
          className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-sm text-emerald-800"
          aria-live="polite"
        >
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-700" />
          {saving ? 'Saving…' : 'Loading next…'}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-gray-500">
        {isCombined
          ? 'Confirm category and owner, then the next transaction loads automatically.'
          : 'Category saves now — assign budget owners in the next pass if needed.'}
      </p>
    </div>
  );
}

function CombinedStepPills({ activeStep }: { activeStep: 'category' | 'owner' | 'confirm' }) {
  return (
    <div
      className="mb-4 flex gap-2"
      role="tablist"
      aria-label="Categorization steps"
    >
      <StepPill
        step={1}
        label="Category"
        state={activeStep === 'category' ? 'active-teal' : 'complete'}
      />
      <StepPill
        step={2}
        label="Owner"
        state={
          activeStep === 'owner'
            ? 'active-blue'
            : activeStep === 'confirm'
              ? 'complete'
              : 'upcoming'
        }
      />
    </div>
  );
}

type StepPillState = 'active-teal' | 'active-blue' | 'complete' | 'upcoming';

function StepPill({
  step,
  label,
  state,
}: {
  step: number;
  label: string;
  state: StepPillState;
}) {
  const styles: Record<StepPillState, string> = {
    'active-teal':
      'border-teal-300 bg-teal-50 text-teal-900 ring-1 ring-teal-200',
    'active-blue':
      'border-sky-300 bg-sky-50 text-sky-900 ring-1 ring-sky-200',
    complete: 'border-emerald-200 bg-emerald-50/80 text-emerald-800',
    upcoming: 'border-gray-200 bg-white text-gray-400',
  };

  return (
    <div
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${styles[state]}`}
      role="tab"
      aria-selected={state.startsWith('active')}
    >
      {state === 'complete' ? (
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
            state.startsWith('active')
              ? state === 'active-blue'
                ? 'bg-sky-600 text-white'
                : 'bg-teal-600 text-white'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {step}
        </span>
      )}
      {label}
    </div>
  );
}

function CategorizationSessionHeader({
  accent,
  question,
  done,
  total,
  remaining,
  progressPct,
  onClose,
  isCombined,
  combinedStep,
  undoAvailable,
  undoDisabled,
  onUndo,
}: {
  accent: 'teal' | 'blue';
  question: string;
  done: number;
  total: number;
  remaining: number;
  progressPct: number;
  onClose: () => void;
  isCombined: boolean;
  combinedStep: 'category' | 'owner' | 'confirm';
  undoAvailable: boolean;
  undoDisabled: boolean;
  onUndo: () => void;
}) {
  const progressColor = accent === 'blue' ? 'bg-sky-500' : 'bg-[#14B8A6]';

  return (
    <header
      className={`border-b ${
        accent === 'blue' ? 'border-sky-100 bg-sky-50/30' : 'border-teal-100/80 bg-teal-50/20'
      }`}
    >
      <div className="px-4 pt-3 pb-2">
        <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
          <span>{done} done</span>
          <span>{progressPct}%</span>
          <span>{remaining} left</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100/80"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`Categorization progress: ${done} of ${total} complete`}
        >
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${progressColor}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
      <div className="flex items-start justify-between gap-2 px-4 pb-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-gray-500 hover:bg-white/60"
          aria-label="Close categorization mode"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-base font-semibold leading-snug text-gray-900">
            {question}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Transaction {done + 1} of {total}
          </p>
        </div>
        <div className="w-9 shrink-0">
          {undoAvailable ? (
            <button
              type="button"
              onClick={onUndo}
              disabled={undoDisabled}
              className="rounded-lg p-2 text-gray-500 hover:bg-white/60 disabled:opacity-40"
              aria-label="Undo last action"
            >
              <Undo2 className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </div>
      {isCombined ? (
        <div className="px-4 pb-3">
          <CombinedStepPills activeStep={combinedStep} />
        </div>
      ) : null}
    </header>
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
