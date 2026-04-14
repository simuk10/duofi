'use client';

import { useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 'transactions' | 'categories' | 'budgets' | 'repayments' | 'credit_cards';

interface UseRealtimeOptions {
  table: TableName;
  householdId: string | null;
  onInsert?: (payload: Record<string, unknown>) => void;
  onUpdate?: (payload: Record<string, unknown>) => void;
  onDelete?: (payload: Record<string, unknown>) => void;
}

export function useRealtime({
  table,
  householdId,
  onInsert,
  onUpdate,
  onDelete,
}: UseRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabase = createClient();

  const setupSubscription = useCallback(() => {
    if (!householdId) return;

    // Must use a unique topic per subscription. Multiple hooks (e.g. two useTransactions
    // for the same household) would otherwise reuse one channel name; the client returns
    // an already-subscribed channel and .on() after subscribe() throws.
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const topic = `${table}_changes_${householdId}_${crypto.randomUUID()}`;

    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table,
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          onInsert?.(payload.new as Record<string, unknown>);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table,
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          onUpdate?.(payload.new as Record<string, unknown>);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table,
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          onDelete?.(payload.old as Record<string, unknown>);
        }
      )
      .subscribe();

    channelRef.current = channel;
  }, [table, householdId, onInsert, onUpdate, onDelete, supabase]);

  useEffect(() => {
    setupSubscription();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [setupSubscription, supabase]);
}
