'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import {
  listCoveredSplitSuggestions,
} from '@/lib/covered-split-suggestions';
import { getDismissedCoveredSuggestions } from '@/lib/covered-split-dismissals';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Transaction } from '@/types/database';

interface Props {
  transactions: Transaction[];
}

export function CoveredSplitReminders({ transactions }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDismissed(getDismissedCoveredSuggestions());
  }, []);

  const suggestions = useMemo(
    () =>
      listCoveredSplitSuggestions(transactions, {
        dismissedIds: dismissed,
      }).slice(0, 5),
    [transactions, dismissed]
  );

  if (suggestions.length === 0) return null;

  const byId = new Map(transactions.map((t) => [t.id, t]));

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-amber-700" />
        <h3 className="text-sm font-semibold text-gray-900">Possible group tabs</h3>
      </div>
      <p className="mb-3 text-xs text-gray-600">
        These charges might be tabs you covered for friends. Split them on Transactions to track
        Venmo requests.
      </p>
      <ul className="space-y-2">
        {suggestions.map((s) => {
          const tx = byId.get(s.transactionId);
          if (!tx) return null;
          return (
            <li key={s.transactionId} className="rounded-lg bg-white/80 px-3 py-2 text-sm">
              <p className="truncate font-medium text-gray-900">{tx.description}</p>
              <p className="text-xs text-gray-500">
                {formatDate(tx.date)} · {formatCurrency(tx.amount)}
              </p>
            </li>
          );
        })}
      </ul>
      <Link
        href="/transactions?venmo=1"
        className="mt-3 block text-center text-xs font-medium text-amber-800 hover:text-amber-900"
      >
        Review on Transactions →
      </Link>
    </div>
  );
}
