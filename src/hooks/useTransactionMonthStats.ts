'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getMonthEndDate } from '@/lib/utils';

export interface MonthTransactionStats {
  total: number;
  categorized: number;
  uncategorized: number;
  withCategory: number;
}

/** Derive per-month counts from loaded transactions (keeps UI in sync after imports/edits). */
export function buildMonthTransactionStats(
  transactions: Array<{
    date: string;
    is_categorized: boolean;
    category_id?: string | null;
  }>,
  monthKeys: string[]
): Record<string, MonthTransactionStats> {
  const init: Record<string, MonthTransactionStats> = {};
  for (const m of monthKeys) {
    init[m] = { total: 0, categorized: 0, uncategorized: 0, withCategory: 0 };
  }
  for (const tx of transactions) {
    const k = tx.date.slice(0, 7);
    if (!init[k]) continue;
    init[k].total += 1;
    if (tx.category_id) init[k].withCategory += 1;
    if (tx.is_categorized) {
      init[k].categorized += 1;
    } else {
      init[k].uncategorized += 1;
    }
  }
  return init;
}

/**
 * Lightweight counts per calendar month (YYYY-MM) for badge / progress UI.
 * Fetches only `date` and `is_categorized`.
 */
export function useTransactionMonthStats(
  householdId: string | null,
  monthKeys: string[]
) {
  const [byMonth, setByMonth] = useState<Record<string, MonthTransactionStats>>({});
  const [loading, setLoading] = useState(true);

  const supabase = createClient();
  const monthsSortedKey = useMemo(
    () => JSON.stringify([...monthKeys].sort()),
    [monthKeys]
  );

  useEffect(() => {
    if (!householdId || monthKeys.length === 0) {
      setByMonth({});
      setLoading(false);
      return;
    }

    const sorted = [...monthKeys].sort() as string[];
    const dateFrom = `${sorted[0]}-01`;
    const endDate = getMonthEndDate(sorted[sorted.length - 1]);

    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('transactions')
        .select('date, is_categorized')
        .eq('household_id', householdId)
        .gte('date', dateFrom)
        .lte('date', endDate);

      if (cancelled) return;

      if (error) {
        setByMonth({});
        setLoading(false);
        return;
      }

      const init = buildMonthTransactionStats([], monthKeys);

      for (const row of data ?? []) {
        const r = row as { date: string; is_categorized: boolean | null };
        const k = r.date.slice(0, 7);
        if (!init[k]) continue;
        init[k].total += 1;
        if (r.is_categorized) {
          init[k].categorized += 1;
        } else {
          init[k].uncategorized += 1;
        }
      }

      setByMonth(init);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [householdId, monthsSortedKey, monthKeys, supabase]);

  return { byMonth, loading };
}
