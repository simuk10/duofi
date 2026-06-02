'use client';

import { Users, X, ChevronRight } from 'lucide-react';
import type { CoveredSplitSuggestion } from '@/lib/covered-split-suggestions';
import type { Transaction } from '@/types/database';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Props {
  suggestions: CoveredSplitSuggestion[];
  transactionsById: Map<string, Transaction>;
  venmoReviewOnly: boolean;
  onToggleFilter: () => void;
  onDismiss: (transactionId: string) => void;
  onOpenTransaction: (tx: Transaction) => void;
}

export function CoveredSplitSuggestionsBanner({
  suggestions,
  transactionsById,
  venmoReviewOnly,
  onToggleFilter,
  onDismiss,
  onOpenTransaction,
}: Props) {
  if (suggestions.length === 0) return null;

  const preview = suggestions.slice(0, 3);

  return (
    <div className="mx-4 mb-3 rounded-xl border border-amber-200 bg-amber-50/90 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <Users className="h-4 w-4 text-amber-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            {suggestions.length} transaction{suggestions.length === 1 ? '' : 's'} might need a
            Venmo split
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            These look like tabs you may have covered for friends. Mark them with &ldquo;I Covered
            This&rdquo; to track who owes you.
          </p>
          <button
            type="button"
            onClick={onToggleFilter}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:text-amber-900"
          >
            {venmoReviewOnly ? 'Show all transactions' : 'Show flagged only'}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <ul className="mt-3 space-y-2 border-t border-amber-200/80 pt-3">
        {preview.map((s) => {
          const tx = transactionsById.get(s.transactionId);
          if (!tx) return null;
          return (
            <li
              key={s.transactionId}
              className="flex items-center gap-2 rounded-lg bg-white/70 px-2 py-2"
            >
              <button
                type="button"
                onClick={() => onOpenTransaction(tx)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium text-gray-900">{tx.description}</p>
                <p className="text-xs text-gray-500">
                  {formatDate(tx.date)} · {formatCurrency(tx.amount)}
                  {s.reasons[0] ? ` · ${s.reasons[0]}` : ''}
                </p>
              </button>
              <button
                type="button"
                onClick={() => onDismiss(s.transactionId)}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-amber-100 hover:text-gray-600"
                aria-label="Dismiss suggestion"
                title="Not a group tab"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      {suggestions.length > preview.length && (
        <p className="mt-2 text-center text-[11px] text-gray-500">
          +{suggestions.length - preview.length} more flagged in this view
        </p>
      )}
    </div>
  );
}
