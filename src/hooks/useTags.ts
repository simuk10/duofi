'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Tag } from '@/types/database';

interface UseTagsOptions {
  householdId: string | null;
}

export function useTags({ householdId }: UseTagsOptions) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!householdId) {
      setTags([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('household_id', householdId)
        .order('name', { ascending: true });

      if (error) throw error;
      setTags((data as Tag[]) || []);
    } catch {
      setTags([]);
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createTag = useCallback(
    async (rawName: string): Promise<Tag> => {
      const name = rawName.trim();
      if (!name || !householdId) throw new Error('Invalid tag name');

      const supabase = createClient();
      const lower = name.toLowerCase();

      const { data, error } = await supabase
        .from('tags')
        .insert({ household_id: householdId, name } as never)
        .select()
        .single();

      if (!error && data) {
        const tag = data as Tag;
        setTags((prev) =>
          [...prev.filter((t) => t.id !== tag.id), tag].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
        return tag;
      }

      if (error?.code === '23505') {
        const { data: rows, error: fetchErr } = await supabase
          .from('tags')
          .select('*')
          .eq('household_id', householdId);

        if (fetchErr) throw fetchErr;
        const list = (rows as Tag[]) || [];
        const found = list.find((t) => t.name.trim().toLowerCase() === lower);
        if (found) {
          setTags([...list].sort((a, b) => a.name.localeCompare(b.name)));
          return found;
        }
      }

      throw error;
    },
    [householdId]
  );

  return { tags, loading, refetch, createTag };
}
