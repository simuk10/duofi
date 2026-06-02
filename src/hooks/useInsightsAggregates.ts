'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  budgetOwnersForInsightFilter,
  computeInsightsAggregatesFromRows,
  parseInsightsAggregates,
  type InsightsAggregates,
  type SlimInsightRow,
} from '@/lib/insights-aggregates';
import type { BudgetOwner } from '@/types/database';

interface UseInsightsAggregatesOptions {
  householdId: string | null;
  dateFrom: string;
  dateTo: string;
  anchorMonth: string;
  ownerFilter: 'personal' | 'joint' | 'total';
  selectedPerson: 'A' | 'B';
  enabled?: boolean;
}

async function fetchViaRpc(
  supabase: ReturnType<typeof createClient>,
  dateFrom: string,
  dateTo: string,
  budgetOwners: BudgetOwner[],
  anchorMonth: string
): Promise<InsightsAggregates | null> {
  const { data, error } = await supabase.rpc('get_insights_aggregates', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_budget_owners: budgetOwners,
    p_anchor_month: anchorMonth,
  });

  if (error) {
    if (
      error.message.includes('get_insights_aggregates') ||
      error.code === 'PGRST202' ||
      error.code === '42883'
    ) {
      return null;
    }
    throw error;
  }

  return parseInsightsAggregates(data);
}

async function fetchViaSlimQuery(
  supabase: ReturnType<typeof createClient>,
  householdId: string,
  dateFrom: string,
  dateTo: string,
  budgetOwners: BudgetOwner[],
  anchorMonth: string
): Promise<InsightsAggregates> {
  let query = supabase
    .from('transactions')
    .select(
      'id, date, amount, description, is_categorized, category_id, budget_owner, category:categories(name)'
    )
    .eq('household_id', householdId)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .in('budget_owner', budgetOwners)
    .order('date', { ascending: false })
    .limit(50_000);

  const { data, error } = await query;

  if (error) throw error;

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const cat = row.category;
    const category =
      cat && typeof cat === 'object' && !Array.isArray(cat) && 'name' in cat
        ? { name: String((cat as { name: unknown }).name) }
        : null;
    return {
      id: String(row.id),
      date: String(row.date),
      amount: Number(row.amount),
      description: String(row.description ?? ''),
      is_categorized: Boolean(row.is_categorized),
      category_id: row.category_id ? String(row.category_id) : null,
      budget_owner: (row.budget_owner as SlimInsightRow['budget_owner']) ?? null,
      category,
    } satisfies SlimInsightRow;
  });

  return computeInsightsAggregatesFromRows(rows, anchorMonth);
}

export function useInsightsAggregates({
  householdId,
  dateFrom,
  dateTo,
  anchorMonth,
  ownerFilter,
  selectedPerson,
  enabled = true,
}: UseInsightsAggregatesOptions) {
  const [aggregates, setAggregates] = useState<InsightsAggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usesRpc, setUsesRpc] = useState<boolean | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const budgetOwners = useMemo(
    () => budgetOwnersForInsightFilter(ownerFilter, selectedPerson),
    [ownerFilter, selectedPerson]
  );
  const budgetOwnersKey = budgetOwners.join(',');

  const fetchAggregates = useCallback(async () => {
    if (!householdId || !dateFrom || !dateTo || !enabled) {
      setAggregates(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rpcResult = await fetchViaRpc(
        supabase,
        dateFrom,
        dateTo,
        budgetOwners,
        anchorMonth
      );

      if (rpcResult) {
        setAggregates(rpcResult);
        setUsesRpc(true);
        return;
      }

      const fallback = await fetchViaSlimQuery(
        supabase,
        householdId,
        dateFrom,
        dateTo,
        budgetOwners,
        anchorMonth
      );
      setAggregates(fallback);
      setUsesRpc(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insights');
      setAggregates(null);
    } finally {
      setLoading(false);
    }
  }, [
    householdId,
    dateFrom,
    dateTo,
    anchorMonth,
    budgetOwnersKey,
    budgetOwners,
    enabled,
    supabase,
  ]);

  useEffect(() => {
    fetchAggregates();
  }, [fetchAggregates]);

  const hasData =
    aggregates != null &&
    (aggregates.monthly_totals.length > 0 ||
      aggregates.top_vendors.length > 0 ||
      (aggregates.anchor_stats?.month_total ?? 0) > 0);

  return {
    aggregates,
    loading,
    error,
    refetch: fetchAggregates,
    hasData,
    usesRpc,
  };
}
