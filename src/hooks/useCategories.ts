'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtime } from './useRealtime';
import type { Category } from '@/types/database';

interface UseCategoriesOptions {
  householdId: string | null;
}

export function useCategories({ householdId }: UseCategoriesOptions) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchCategories = useCallback(async () => {
    if (!householdId) {
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('categories')
        .select('*')
        .eq('household_id', householdId)
        .order('name');

      if (fetchError) throw fetchError;
      setCategories(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  }, [householdId, supabase]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useRealtime({
    table: 'categories',
    householdId,
    onInsert: (payload) => {
      setCategories((prev) => [...prev, payload as unknown as Category].sort((a, b) =>
        a.name.localeCompare(b.name)
      ));
    },
    onUpdate: (payload) => {
      setCategories((prev) =>
        prev.map((c) =>
          c.id === (payload as unknown as Category).id ? (payload as unknown as Category) : c
        )
      );
    },
    onDelete: (payload) => {
      setCategories((prev) =>
        prev.filter((c) => c.id !== (payload as { id: string }).id)
      );
    },
  });

  const createCategory = async (name: string, color?: string, icon?: string) => {
    if (!householdId) throw new Error('No household');

    const { data, error: insertError } = await supabase
      .from('categories')
      .insert({ name, color, icon, household_id: householdId })
      .select()
      .single();

    if (insertError) throw insertError;
    return data;
  };

  const updateCategory = async (
    id: string,
    updates: { name?: string; color?: string; icon?: string }
  ) => {
    const { data, error: updateError } = await supabase
      .from('categories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update local state
    setCategories((prev) =>
      prev
        .map((c) => (c.id === id ? { ...c, ...data } : c))
        .sort((a, b) => a.name.localeCompare(b.name))
    );

    return data;
  };

  const deleteCategory = async (id: string) => {
    const { error: deleteError } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    // Update local state
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  return {
    categories,
    loading,
    error,
    refetch: fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
