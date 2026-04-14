'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { BudgetOwner } from '@/types/database';
import { addCalendarMonths } from '@/lib/utils';
import {
  averageMonthlySpendByOwner,
  firstDayOfMonthYmd,
  getPriorMonthKeys,
  lastDayOfMonthYmd,
  predictNextFromTrend,
  roundMoney,
} from '@/lib/budget-suggestions';

export type SuggestionSource = 'goal_trend' | 'avg_spend';

export interface OwnerSuggestion {
  amount: number;
  source: SuggestionSource;
}

export interface BudgetSuggestionsState {
  loading: boolean;
  person_a: OwnerSuggestion | null;
  person_b: OwnerSuggestion | null;
  joint: OwnerSuggestion | null;
}

const INITIAL: BudgetSuggestionsState = {
  loading: false,
  person_a: null,
  person_b: null,
  joint: null,
};

interface BudgetRow {
  month_year: string;
  budget_owner: BudgetOwner;
  goal_amount: number;
}

export function useBudgetSuggestions({
  householdId,
  categoryId,
  monthYear,
  enabled,
}: {
  householdId: string | null;
  categoryId: string | null;
  /** YYYY-MM — suggestions are for this month, using data strictly before it. */
  monthYear: string;
  enabled: boolean;
}): BudgetSuggestionsState {
  const [state, setState] = useState<BudgetSuggestionsState>(INITIAL);

  useEffect(() => {
    if (!enabled || !householdId || !categoryId || !monthYear) {
      setState({
        loading: false,
        person_a: null,
        person_b: null,
        joint: null,
      });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    const supabase = createClient();
    const minMonth = getPriorMonthKeys(monthYear, 24)[0] ?? monthYear;

    (async () => {
      try {
        const { data: budgetRows, error: bErr } = await supabase
          .from('budgets')
          .select('month_year, budget_owner, goal_amount')
          .eq('household_id', householdId)
          .eq('category_id', categoryId)
          .gte('month_year', minMonth)
          .lt('month_year', monthYear)
          .order('month_year', { ascending: true });

        if (bErr) throw bErr;

        const rows = (budgetRows || []) as BudgetRow[];

        const byOwner: Record<BudgetOwner, number[]> = {
          person_a: [],
          person_b: [],
          joint: [],
        };

        const grouped: Record<BudgetOwner, Map<string, number>> = {
          person_a: new Map(),
          person_b: new Map(),
          joint: new Map(),
        };

        for (const r of rows) {
          const g = grouped[r.budget_owner];
          g.set(r.month_year, Number(r.goal_amount));
        }

        const owners: BudgetOwner[] = ['person_a', 'person_b', 'joint'];
        const monthKeysChrono = [...new Set(rows.map((r) => r.month_year))].sort();

        for (const owner of owners) {
          const series: number[] = [];
          for (const my of monthKeysChrono) {
            const v = grouped[owner].get(my);
            if (v !== undefined && v > 0) series.push(v);
          }
          byOwner[owner] = series;
        }

        const spendMonths = getPriorMonthKeys(monthYear, 12);
        const spendFrom = firstDayOfMonthYmd(spendMonths[0]);
        const spendTo = lastDayOfMonthYmd(addCalendarMonths(monthYear, -1));

        const { data: txRows, error: tErr } = await supabase
          .from('transactions')
          .select('amount, date, budget_owner')
          .eq('household_id', householdId)
          .eq('category_id', categoryId)
          .eq('is_categorized', true)
          .gte('date', spendFrom)
          .lte('date', spendTo);

        if (tErr) throw tErr;

        const spendTxs = (txRows || []).map((t) => ({
          amount: Number(t.amount),
          date: t.date as string,
          budget_owner: t.budget_owner as BudgetOwner | null,
        }));

        const buildSuggestion = (owner: BudgetOwner): OwnerSuggestion | null => {
          const trend = predictNextFromTrend(byOwner[owner]);
          if (trend != null && trend > 0) {
            return { amount: trend, source: 'goal_trend' };
          }
          const spend = averageMonthlySpendByOwner(spendTxs, owner, spendMonths);
          if (spend != null && spend > 0) {
            return { amount: roundMoney(spend), source: 'avg_spend' };
          }
          return null;
        };

        const next: BudgetSuggestionsState = {
          loading: false,
          person_a: buildSuggestion('person_a'),
          person_b: buildSuggestion('person_b'),
          joint: buildSuggestion('joint'),
        };

        if (!cancelled) setState(next);
      } catch {
        if (!cancelled) {
          setState({
            loading: false,
            person_a: null,
            person_b: null,
            joint: null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [householdId, categoryId, monthYear, enabled]);

  return state;
}
