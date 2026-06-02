'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal, Button } from '@/components/ui';
import { categoryIconToEmoji } from '@/lib/category-icons';
import {
  confidencePercent,
  confidenceTierLabel,
  type HighConfidenceTarget,
} from '@/lib/categorization-guesses';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ChevronDown, X } from 'lucide-react';
import type { BudgetOwner, Category, Transaction } from '@/types/database';

export interface ReviewApplyPayload {
  id: string;
  category_id: string;
  budget_owner: BudgetOwner;
}

interface ReviewRowState {
  transaction: Transaction;
  guess: HighConfidenceTarget['guess'];
  categoryId: string;
  budgetOwner: BudgetOwner;
  excluded: boolean;
}

interface HighConfidenceReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  targets: HighConfidenceTarget[];
  categories: Category[];
  ownerLabel: (o: BudgetOwner) => string;
  budgetOwnerOptions: { value: BudgetOwner; label: string }[];
  onApplyBatch: (items: ReviewApplyPayload[]) => Promise<void>;
  /** Save a single correction immediately (trains the model on next refresh). */
  onSaveCorrection: (item: ReviewApplyPayload) => Promise<void>;
}

export function HighConfidenceReviewModal({
  isOpen,
  onClose,
  targets,
  categories,
  ownerLabel,
  budgetOwnerOptions,
  onApplyBatch,
  onSaveCorrection,
}: HighConfidenceReviewModalProps) {
  const [rows, setRows] = useState<ReviewRowState[]>([]);
  const [applying, setApplying] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRows(
      targets.map(({ transaction, guess }) => ({
        transaction,
        guess,
        categoryId: guess.categoryId,
        budgetOwner: guess.budgetOwner,
        excluded: false,
      }))
    );
  }, [isOpen, targets]);

  const activeRows = useMemo(() => rows.filter((r) => !r.excluded), [rows]);

  const categoryOptions = useMemo(
    () =>
      categories.map((c) => ({
        value: c.id,
        label: `${categoryIconToEmoji(c.icon, c.name)} ${c.name}`,
      })),
    [categories]
  );

  const updateRow = (id: string, patch: Partial<Pick<ReviewRowState, 'categoryId' | 'budgetOwner' | 'excluded'>>) => {
    setRows((prev) =>
      prev.map((r) => (r.transaction.id === id ? { ...r, ...patch } : r))
    );
  };

  const handleSaveOne = async (row: ReviewRowState) => {
    setSavingId(row.transaction.id);
    try {
      await onSaveCorrection({
        id: row.transaction.id,
        category_id: row.categoryId,
        budget_owner: row.budgetOwner,
      });
      setRows((prev) => prev.filter((r) => r.transaction.id !== row.transaction.id));
    } finally {
      setSavingId(null);
    }
  };

  const handleApplyAll = async () => {
    if (activeRows.length === 0) return;
    setApplying(true);
    try {
      await onApplyBatch(
        activeRows.map((r) => ({
          id: r.transaction.id,
          category_id: r.categoryId,
          budget_owner: r.budgetOwner,
        }))
      );
      onClose();
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Review before applying"
      className="max-w-lg"
    >
      <p className="mb-4 text-sm text-gray-600">
        These {targets.length} transaction{targets.length === 1 ? '' : 's'} matched your history
        with high confidence. Adjust any row, save one-off corrections, or apply the rest in bulk.
      </p>

      <ul className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
        {rows.map((row) => {
          const cat = categories.find((c) => c.id === row.categoryId);
          return (
            <li
              key={row.transaction.id}
              className={`rounded-xl border p-3 ${
                row.excluded
                  ? 'border-gray-100 bg-gray-50/80 opacity-60'
                  : 'border-emerald-100 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {row.transaction.description}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {formatDate(row.transaction.date)} · {formatCurrency(row.transaction.amount)}
                  </p>
                  <p className="mt-1 text-xs text-emerald-800">
                    {confidenceTierLabel(row.guess.confidenceTier)} (
                    {confidencePercent(row.guess.confidence)}%)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updateRow(row.transaction.id, { excluded: !row.excluded })}
                  className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label={row.excluded ? 'Include in batch' : 'Skip this transaction'}
                  title={row.excluded ? 'Include' : 'Skip'}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {!row.excluded && (
                <div className="mt-3 space-y-2">
                  <div className="relative">
                    <select
                      aria-label="Category"
                      value={row.categoryId}
                      onChange={(e) =>
                        updateRow(row.transaction.id, { categoryId: e.target.value })
                      }
                      className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-3 pr-8 text-sm text-gray-800"
                    >
                      {categoryOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>
                  <div className="relative">
                    <select
                      aria-label="Budget owner"
                      value={row.budgetOwner}
                      onChange={(e) =>
                        updateRow(row.transaction.id, {
                          budgetOwner: e.target.value as BudgetOwner,
                        })
                      }
                      className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-3 pr-8 text-sm text-gray-800"
                    >
                      {budgetOwnerOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>
                  {(row.categoryId !== row.guess.categoryId ||
                    row.budgetOwner !== row.guess.budgetOwner) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      loading={savingId === row.transaction.id}
                      onClick={() => void handleSaveOne(row)}
                    >
                      Save correction
                      {cat ? ` · ${cat.name}` : ''} · {ownerLabel(row.budgetOwner)}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">All reviewed — nothing left to apply.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4">
          <Button
            onClick={() => void handleApplyAll()}
            loading={applying}
            disabled={applying || activeRows.length === 0}
          >
            Apply {activeRows.length} transaction{activeRows.length === 1 ? '' : 's'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      )}
    </Modal>
  );
}
