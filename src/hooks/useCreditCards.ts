'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtime } from './useRealtime';
import type { CreditCard, PaidBy } from '@/types/database';

interface UseCreditCardsOptions {
  householdId: string | null;
}

export function useCreditCards({ householdId }: UseCreditCardsOptions) {
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchCreditCards = useCallback(async () => {
    if (!householdId) {
      setCreditCards([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('credit_cards')
        .select('*')
        .eq('household_id', householdId)
        .order('name');

      if (fetchError) throw fetchError;
      setCreditCards(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch credit cards');
    } finally {
      setLoading(false);
    }
  }, [householdId, supabase]);

  useEffect(() => {
    fetchCreditCards();
  }, [fetchCreditCards]);

  useRealtime({
    table: 'credit_cards',
    householdId,
    onInsert: (payload) => {
      setCreditCards((prev) =>
        [...prev, payload as unknown as CreditCard].sort((a, b) => a.name.localeCompare(b.name))
      );
    },
    onUpdate: (payload) => {
      setCreditCards((prev) =>
        prev.map((c) =>
          c.id === (payload as unknown as CreditCard).id
            ? (payload as unknown as CreditCard)
            : c
        )
      );
    },
    onDelete: (payload) => {
      setCreditCards((prev) =>
        prev.filter((c) => c.id !== (payload as { id: string }).id)
      );
    },
  });

  const createCreditCard = async (
    name: string,
    paidBy: PaidBy,
    lastFour?: string
  ) => {
    if (!householdId) throw new Error('No household');

    const { data, error: insertError } = await supabase
      .from('credit_cards')
      .insert({
        name,
        paid_by: paidBy,
        last_four: lastFour || null,
        household_id: householdId,
      })
      .select()
      .single();

    if (insertError) throw insertError;
    return data;
  };

  const updateCreditCard = async (
    id: string,
    updates: { name?: string; paid_by?: PaidBy; last_four?: string }
  ) => {
    const { error: updateError } = await supabase
      .from('credit_cards')
      .update(updates)
      .eq('id', id);

    if (updateError) throw updateError;
  };

  const deleteCreditCard = async (id: string) => {
    const { error: deleteError } = await supabase
      .from('credit_cards')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;
  };

  return {
    creditCards,
    loading,
    error,
    refetch: fetchCreditCards,
    createCreditCard,
    updateCreditCard,
    deleteCreditCard,
  };
}
