import { formatCurrency, formatDate } from '@/lib/utils';
import type { Transaction } from '@/types/database';

/** Lowercase blob used for substring search across months. */
export function buildTransactionSearchHaystack(t: Transaction): string {
  const amount = t.amount;
  const amountBits = [
    String(amount),
    amount.toFixed(2),
    formatCurrency(amount).toLowerCase(),
  ];
  return [
    t.description,
    t.notes ?? '',
    t.date,
    formatDate(t.date),
    ...amountBits,
  ]
    .join(' ')
    .toLowerCase();
}

export function transactionMatchesSearch(t: Transaction, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return false;
  return buildTransactionSearchHaystack(t).includes(q);
}
