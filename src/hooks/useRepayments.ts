'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtime } from './useRealtime';
import type { Repayment, BudgetOwner } from '@/types/database';

interface UseRepaymentsOptions {
  householdId: string | null;
}

export function useRepayments({ householdId }: UseRepaymentsOptions) {
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchRepayments = useCallback(async () => {
    if (!householdId) {
      setRepayments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('repayments')
        .select('*')
        .eq('household_id', householdId)
        .order('date', { ascending: false });

      if (fetchError) throw fetchError;
      setRepayments(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch repayments');
    } finally {
      setLoading(false);
    }
  }, [householdId, supabase]);

  useEffect(() => {
    fetchRepayments();
  }, [fetchRepayments]);

  useRealtime({
    table: 'repayments',
    householdId,
    onInsert: (payload) => {
      setRepayments((prev) => [payload as unknown as Repayment, ...prev]);
    },
    onDelete: (payload) => {
      setRepayments((prev) =>
        prev.filter((r) => r.id !== (payload as { id: string }).id)
      );
    },
  });

  const recordRepayment = async (
    paidBy: BudgetOwner,
    paidTo: BudgetOwner,
    amount: number,
    notes?: string
  ) => {
    if (!householdId) throw new Error('No household');
    if (paidBy === 'joint' || paidTo === 'joint') {
      throw new Error('Repayments must be between Person A and Person B');
    }
    if (paidBy === paidTo) {
      throw new Error('Payer and recipient must be different');
    }

    const { data, error: insertError } = await supabase
      .from('repayments')
      .insert({
        paid_by: paidBy,
        paid_to: paidTo,
        amount,
        notes,
        household_id: householdId,
        date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (insertError) throw insertError;
    return data;
  };

  const deleteRepayment = async (id: string) => {
    const { error: deleteError } = await supabase
      .from('repayments')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;
  };

  return {
    repayments,
    loading,
    error,
    refetch: fetchRepayments,
    recordRepayment,
    deleteRepayment,
  };
}
