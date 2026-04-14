'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CardImport } from '@/types/database';
import { monthCoveredByImportRange } from '@/lib/card-import-utils';

interface UseCardImportsOptions {
  householdId: string | null;
}

export function useCardImports({ householdId }: UseCardImportsOptions) {
  const [imports, setImports] = useState<CardImport[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!householdId) {
      setImports([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('card_imports')
        .select('*')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setImports((data as CardImport[]) || []);
    } catch {
      setImports([]);
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const isCardCoveredForMonth = useCallback(
    (creditCardId: string, monthYm: string) => {
      return imports.some(
        (row) =>
          row.credit_card_id === creditCardId &&
          monthCoveredByImportRange(monthYm, row.date_from, row.date_to)
      );
    },
    [imports]
  );

  return { imports, loading, refetch, isCardCoveredForMonth };
}
