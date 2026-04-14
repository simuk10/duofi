import { addCalendarMonths } from '@/lib/utils';
import type { BudgetOwner } from '@/types/database';

export function roundMoney(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100;
}

/**
 * Predict next value from a chronological series of goal amounts using simple linear regression
 * on indices 0..n-1, evaluated at x = n (next month after the series).
 */
export function predictNextFromTrend(amountsOldestToNewest: number[]): number | null {
  const ys = amountsOldestToNewest.filter((v) => v > 0);
  if (ys.length === 0) return null;
  if (ys.length === 1) return roundMoney(ys[0]);
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return roundMoney(meanY);
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  const nextY = slope * n + intercept;
  return roundMoney(Math.max(0, nextY));
}

export function getPriorMonthKeys(throughExclusive: string, count: number): string[] {
  const keys: string[] = [];
  for (let i = count; i >= 1; i--) {
    keys.push(addCalendarMonths(throughExclusive, -i));
  }
  return keys;
}

export function lastDayOfMonthYmd(monthYear: string): string {
  const [y, m] = monthYear.split('-').map(Number);
  return new Date(y, m, 0).toISOString().split('T')[0];
}

export function firstDayOfMonthYmd(monthYear: string): string {
  const [y, m] = monthYear.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export interface SpendRow {
  amount: number;
  date: string;
  budget_owner: BudgetOwner | null;
}

/** Average spend per month over the given month keys (zero months included). */
export function averageMonthlySpendByOwner(
  txs: SpendRow[],
  owner: BudgetOwner,
  monthKeys: string[]
): number | null {
  if (monthKeys.length === 0) return null;
  const sums = new Map<string, number>();
  for (const k of monthKeys) sums.set(k, 0);
  for (const t of txs) {
    if (t.budget_owner !== owner) continue;
    const my = t.date.slice(0, 7);
    if (!sums.has(my)) continue;
    sums.set(my, (sums.get(my) || 0) + t.amount);
  }
  const total = monthKeys.reduce((acc, k) => acc + (sums.get(k) || 0), 0);
  if (total <= 0) return null;
  return roundMoney(total / monthKeys.length);
}
