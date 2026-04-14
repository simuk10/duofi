'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtime } from './useRealtime';
import { getLatestCompleteMonthYear } from '@/lib/utils';
import type { Budget, BudgetOwner } from '@/types/database';

interface UseBudgetsOptions {
  householdId: string | null;
  monthYear?: string;
}

export function useBudgets({ householdId, monthYear }: UseBudgetsOptions) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();
  const currentMonthYear = monthYear || getLatestCompleteMonthYear();

  const fetchBudgets = useCallback(async () => {
    if (!householdId) {
      setBudgets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('budgets')
        .select(`
          *,
          category:categories(*)
        `)
        .eq('household_id', householdId)
        .eq('month_year', currentMonthYear);

      if (fetchError) throw fetchError;
      setBudgets(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch budgets');
    } finally {
      setLoading(false);
    }
  }, [householdId, currentMonthYear, supabase]);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  useRealtime({
    table: 'budgets',
    householdId,
    onInsert: (payload) => {
      const budget = payload as unknown as Budget;
      if (budget.month_year === currentMonthYear) {
        setBudgets((prev) => [...prev, budget]);
      }
    },
    onUpdate: (payload) => {
      setBudgets((prev) =>
        prev.map((b) =>
          b.id === (payload as unknown as Budget).id ? (payload as unknown as Budget) : b
        )
      );
    },
    onDelete: (payload) => {
      setBudgets((prev) =>
        prev.filter((b) => b.id !== (payload as { id: string }).id)
      );
    },
  });

  const upsertBudget = async (
    categoryId: string,
    budgetOwner: BudgetOwner,
    goalAmount: number
  ) => {
    if (!householdId) throw new Error('No household');

    // If goal amount is 0, delete the budget instead
    if (goalAmount <= 0) {
      const existingBudget = budgets.find(
        (b) =>
          b.category_id === categoryId &&
          b.budget_owner === budgetOwner &&
          b.month_year === currentMonthYear
      );

      if (existingBudget) {
        await deleteBudget(existingBudget.id);
      }
      return null;
    }

    const { data, error: upsertError } = await supabase
      .from('budgets')
      .upsert(
        {
          category_id: categoryId,
          month_year: currentMonthYear,
          budget_owner: budgetOwner,
          goal_amount: goalAmount,
          household_id: householdId,
        },
        {
          onConflict: 'category_id,month_year,budget_owner,household_id',
        }
      )
      .select()
      .single();

    if (upsertError) throw upsertError;
    
    // Refresh budgets to get updated data
    await fetchBudgets();
    
    return data;
  };

  const updateBudget = async (
    id: string,
    goalAmount: number
  ) => {
    if (goalAmount <= 0) {
      await deleteBudget(id);
      return;
    }

    const { error: updateError } = await supabase
      .from('budgets')
      .update({ goal_amount: goalAmount })
      .eq('id', id);

    if (updateError) throw updateError;

    setBudgets((prev) =>
      prev.map((b) => (b.id === id ? { ...b, goal_amount: goalAmount } : b))
    );
  };

  const deleteBudget = async (id: string) => {
    const { error: deleteError } = await supabase
      .from('budgets')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    setBudgets((prev) => prev.filter((b) => b.id !== id));
  };

  const clearAllBudgetsForCategory = async (categoryId: string) => {
    if (!householdId) throw new Error('No household');

    const { error: deleteError } = await supabase
      .from('budgets')
      .delete()
      .eq('category_id', categoryId)
      .eq('month_year', currentMonthYear)
      .eq('household_id', householdId);

    if (deleteError) throw deleteError;

    setBudgets((prev) =>
      prev.filter(
        (b) =>
          !(b.category_id === categoryId && b.month_year === currentMonthYear)
      )
    );
  };

  return {
    budgets,
    loading,
    error,
    refetch: fetchBudgets,
    upsertBudget,
    updateBudget,
    deleteBudget,
    clearAllBudgetsForCategory,
  };
}
