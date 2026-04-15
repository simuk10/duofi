'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtime } from './useRealtime';
import type { Transaction, BudgetOwner, PaidBy, Tag, CoveredSplit } from '@/types/database';
import {
  mapBudgetTypeToBudgetOwner,
  type ParsedCategorizedTransaction,
} from '@/lib/csv-parser';
import { suggestEmojiFromCategoryName } from '@/lib/category-icons';
import {
  dateRangeFromRows,
  groupedDateRangesByCardName,
} from '@/lib/card-import-utils';

function mapTransactionRow(row: Record<string, unknown>): Transaction {
  const tt = row.transaction_tags as
    | Array<{ tags?: Tag | null; tag?: Tag | null }>
    | undefined;
  const tagList: Tag[] = [];
  if (Array.isArray(tt)) {
    for (const j of tt) {
      const t = j?.tags ?? j?.tag;
      if (t && typeof t === 'object' && 'id' in t && 'name' in t) {
        tagList.push(t as Tag);
      }
    }
  }
  const { transaction_tags: _ignored, ...rest } = row;
  return { ...(rest as unknown as Transaction), tags: tagList };
}

/** Loads tag assignments in a separate query so transactions still load if migration 006 is missing. */
async function loadTagsForTransactions(
  supabase: ReturnType<typeof createClient>,
  transactionIds: string[]
): Promise<Map<string, Tag[]>> {
  const byTx = new Map<string, Tag[]>();
  if (transactionIds.length === 0) return byTx;

  const { data, error } = await supabase
    .from('transaction_tags')
    .select('transaction_id, tags(*)')
    .in('transaction_id', transactionIds);

  if (error) {
    console.warn(
      '[transactions] Could not load tags (add migration 006_transaction_tags.sql if you use tags):',
      error.message
    );
    return byTx;
  }

  type Row = {
    transaction_id: string;
    tags?: Tag | null;
    tag?: Tag | null;
  };
  for (const row of (data ?? []) as unknown as Row[]) {
    const tag = row.tags ?? row.tag;
    if (!tag || typeof tag !== 'object' || !('id' in tag)) continue;
    const tid = row.transaction_id;
    const list = byTx.get(tid) ?? [];
    list.push(tag as Tag);
    byTx.set(tid, list);
  }
  return byTx;
}

interface UseTransactionsOptions {
  householdId: string | null;
  filter?: 'all' | 'categorized' | 'uncategorized';
  /** YYYY-MM — if set, only that calendar month (takes precedence over dateFrom/dateTo). */
  monthYear?: string;
  /** Inclusive YYYY-MM-DD; use with dateTo for range queries (e.g. chart). Ignored when monthYear is set. */
  dateFrom?: string;
  dateTo?: string;
  /** Narrow to one category (e.g. budget drill-down). */
  categoryId?: string | null;
  /** Narrow to one budget owner (with categoryId). */
  budgetOwner?: BudgetOwner | null;
  /** Show transactions that have any of these tag ids (OR). */
  tagFilterIds?: string[];
  /** When false, skip fetch and keep an empty list (e.g. lazy search pool). */
  enabled?: boolean;
}

export function useTransactions({
  householdId,
  filter = 'all',
  monthYear,
  dateFrom,
  dateTo,
  categoryId,
  budgetOwner,
  tagFilterIds,
  enabled = true,
}: UseTransactionsOptions) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const supabase = createClient();

  const fetchTransactions = useCallback(async () => {
    if (!householdId) {
      setTransactions([]);
      setLoading(false);
      return;
    }
    if (!enabled) {
      setTransactions([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let idIn: string[] | null = null;
      if (tagFilterIds && tagFilterIds.length > 0) {
        const { data: links, error: linkErr } = await supabase
          .from('transaction_tags')
          .select('transaction_id')
          .in('tag_id', tagFilterIds);
        if (linkErr) {
          console.warn(
            '[transactions] Tag filter skipped (transaction_tags table missing?):',
            linkErr.message
          );
        } else {
          idIn = [
            ...new Set(
              (links ?? []).map(
                (r: { transaction_id: string }) => r.transaction_id
              )
            ),
          ];
          if (idIn.length === 0) {
            setTransactions([]);
            setLoading(false);
            return;
          }
        }
      }

      let query = supabase
        .from('transactions')
        .select(`
          *,
          category:categories(*),
          credit_card:credit_cards(*)
        `)
        .eq('household_id', householdId)
        .order('date', { ascending: false });

      if (idIn) {
        query = query.in('id', idIn);
      }

      if (filter === 'categorized') {
        query = query.eq('is_categorized', true);
      } else if (filter === 'uncategorized') {
        query = query.eq('is_categorized', false);
      }

      if (monthYear) {
        const [year, month] = monthYear.split('-');
        const startDate = `${year}-${month}-01`;
        const endDate = new Date(parseInt(year), parseInt(month), 0)
          .toISOString()
          .split('T')[0];
        query = query.gte('date', startDate).lte('date', endDate);
      } else if (dateFrom && dateTo) {
        query = query.gte('date', dateFrom).lte('date', dateTo);
      }

      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }
      if (budgetOwner) {
        query = query.eq('budget_owner', budgetOwner);
      }

      if (!monthYear && !(dateFrom && dateTo)) {
        query = query.limit(20_000);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const rows = (data || []) as Record<string, unknown>[];
      const base = rows.map((row) =>
        mapTransactionRow({ ...row, transaction_tags: undefined })
      );
      const tagMap = await loadTagsForTransactions(
        supabase,
        base.map((t) => t.id)
      );
      setTransactions(
        base.map((t) => ({ ...t, tags: tagMap.get(t.id) ?? [] }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  }, [
    householdId,
    filter,
    monthYear,
    dateFrom,
    dateTo,
    categoryId,
    budgetOwner,
    tagFilterIds,
    enabled,
    supabase,
  ]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Real-time updates
  useRealtime({
    table: 'transactions',
    householdId,
    onInsert: (payload) => {
      if (!enabledRef.current) return;
      const row = { ...(payload as Record<string, unknown>), transaction_tags: [] };
      setTransactions((prev) => [mapTransactionRow(row), ...prev]);
    },
    onUpdate: (payload) => {
      if (!enabledRef.current) return;
      const p = payload as unknown as Transaction;
      setTransactions((prev) =>
        prev.map((t) => {
          if (t.id !== p.id) return t;
          return {
            ...p,
            tags: t.tags,
            category: t.category,
            credit_card: t.credit_card,
          };
        })
      );
    },
    onDelete: (payload) => {
      if (!enabledRef.current) return;
      setTransactions((prev) =>
        prev.filter((t) => t.id !== (payload as { id: string }).id)
      );
    },
  });

  const updateTransaction = useCallback(
    async (
      id: string,
      updates: {
        category_id?: string | null;
        budget_owner?: BudgetOwner | null;
        notes?: string | null;
        amount?: number;
        is_covered?: boolean;
        covered_split?: CoveredSplit | null;
      }
    ) => {
      let cur = transactions.find((t) => t.id === id);
      if (!cur) {
        const { data, error: oneErr } = await supabase
          .from('transactions')
          .select('*, category:categories(*), credit_card:credit_cards(*)')
          .eq('id', id)
          .maybeSingle();
        if (oneErr) throw oneErr;
        if (!data) throw new Error('Transaction not found');
        const tagMap = await loadTagsForTransactions(supabase, [id]);
        cur = {
          ...mapTransactionRow({ ...data, transaction_tags: undefined }),
          tags: tagMap.get(id) ?? [],
        };
      }

      const nextCat =
        updates.category_id !== undefined ? updates.category_id : cur.category_id;
      const nextOwner =
        updates.budget_owner !== undefined ? updates.budget_owner : cur.budget_owner;
      const is_categorized = !!(nextCat && nextOwner);

      const { error: updateError } = await supabase
        .from('transactions')
        .update({ ...updates, is_categorized })
        .eq('id', id);

      if (updateError) {
        throw updateError;
      }

      setTransactions((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        const merged = { ...cur!, ...updates, is_categorized };
        if (idx === -1) return prev;
        return prev.map((t) => (t.id === id ? merged : t));
      });
    },
    [supabase, transactions]
  );

  const deleteTransaction = async (id: string) => {
    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw deleteError;
    }

    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  const importTransactions = async (
    transactions: Array<{
      date: string;
      description: string;
      amount: number;
    }>,
    creditCardId: string,
    paidBy: 'person_a' | 'person_b' | 'joint',
    meta?: { fileHash: string }
  ) => {
    if (!householdId) throw new Error('No household');

    const { error: insertError } = await supabase.from('transactions').insert(
      transactions.map((t) => ({
        ...t,
        credit_card_id: creditCardId,
        paid_by: paidBy,
        household_id: householdId,
        is_categorized: false,
      }))
    );

    if (insertError) throw insertError;

    if (meta?.fileHash && transactions.length > 0) {
      const { dateFrom, dateTo } = dateRangeFromRows(transactions);
      const { error: importLogError } = await supabase.from('card_imports').insert({
        household_id: householdId,
        credit_card_id: creditCardId,
        file_hash: meta.fileHash,
        date_from: dateFrom,
        date_to: dateTo,
        transaction_count: transactions.length,
      } as never);
      if (importLogError) throw importLogError;
    }

    // Refresh to get the complete data with joins
    await fetchTransactions();
  };

  const importCategorizedTransactions = async (
    rows: ParsedCategorizedTransaction[],
    personAName: string,
    personBName: string,
    meta?: { fileHash: string }
  ) => {
    if (!householdId) throw new Error('No household');

    // Collect unique source accounts and categories from CSV
    const uniqueAccounts = [...new Set(rows.map((r) => r.sourceAccount))];
    const uniqueCategories = [...new Set(rows.map((r) => r.category))];

    // Fetch existing credit cards and categories for this household
    const [{ data: existingCards }, { data: existingCats }] = await Promise.all([
      supabase.from('credit_cards').select('*').eq('household_id', householdId),
      supabase.from('categories').select('*').eq('household_id', householdId),
    ]);

    const cardsByName = new Map(
      (existingCards ?? []).map((c) => [c.name.toLowerCase(), c])
    );
    const catsByName = new Map(
      (existingCats ?? []).map((c) => [c.name.toLowerCase(), c])
    );

    const pA = personAName.trim().toLowerCase();
    const pB = personBName.trim().toLowerCase();

    function inferPaidBy(accountName: string): PaidBy {
      const lower = accountName.toLowerCase();
      if (lower.startsWith(pA) || lower.includes(pA)) return 'person_a';
      if (lower.startsWith(pB) || lower.includes(pB)) return 'person_b';
      return 'joint';
    }

    // Create missing credit cards
    for (const account of uniqueAccounts) {
      if (!cardsByName.has(account.toLowerCase())) {
        const { data, error: err } = await supabase
          .from('credit_cards')
          .insert({ name: account, paid_by: inferPaidBy(account), household_id: householdId })
          .select()
          .single();
        if (err) throw new Error(`Failed to create card "${account}": ${err.message}`);
        cardsByName.set(account.toLowerCase(), data);
      }
    }

    // Create missing categories
    for (const cat of uniqueCategories) {
      if (!catsByName.has(cat.toLowerCase())) {
        const { data, error: err } = await supabase
          .from('categories')
          .insert({
            name: cat,
            household_id: householdId,
            icon: suggestEmojiFromCategoryName(cat),
          })
          .select()
          .single();
        if (err) throw new Error(`Failed to create category "${cat}": ${err.message}`);
        catsByName.set(cat.toLowerCase(), data);
      }
    }

    // Build transaction rows in batches of 500
    const allRows = rows.map((r) => {
      const card = cardsByName.get(r.sourceAccount.toLowerCase())!;
      const cat = catsByName.get(r.category.toLowerCase())!;
      return {
        date: r.date,
        description: r.description,
        amount: r.amount,
        credit_card_id: card.id,
        paid_by: card.paid_by,
        category_id: cat.id,
        budget_owner: mapBudgetTypeToBudgetOwner(
          r.budgetType,
          personAName,
          personBName
        ),
        is_categorized: true,
        notes: null,
        household_id: householdId,
      };
    });

    const BATCH_SIZE = 500;
    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      const batch = allRows.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase
        .from('transactions')
        .insert(batch);
      if (insertError) throw insertError;
    }

    if (meta?.fileHash && rows.length > 0) {
      const cardNameToId = new Map<string, string>();
      for (const [name, c] of cardsByName) {
        cardNameToId.set(name, c.id);
      }
      const grouped = groupedDateRangesByCardName(
        rows.map((r) => ({ date: r.date, sourceAccount: r.sourceAccount })),
        cardNameToId
      );
      const importRows = [...grouped.entries()].map(
        ([creditCardId, v]) => ({
          household_id: householdId,
          credit_card_id: creditCardId,
          file_hash: meta.fileHash,
          date_from: v.dateFrom,
          date_to: v.dateTo,
          transaction_count: v.count,
        })
      );
      if (importRows.length > 0) {
        const { error: importLogError } = await supabase
          .from('card_imports')
          .insert(importRows as never);
        if (importLogError) throw importLogError;
      }
    }

    await fetchTransactions();
  };

  const replaceTransactionTags = useCallback(
    async (transactionId: string, tagIds: string[]) => {
      const { error: delErr } = await supabase
        .from('transaction_tags')
        .delete()
        .eq('transaction_id', transactionId);
      if (delErr) throw delErr;

      if (tagIds.length > 0) {
        const { error: insErr } = await supabase.from('transaction_tags').insert(
          tagIds.map((tag_id) => ({
            transaction_id: transactionId,
            tag_id,
          })) as never
        );
        if (insErr) throw insErr;
      }

      await fetchTransactions();
    },
    [supabase, fetchTransactions]
  );

  return {
    transactions,
    loading,
    error,
    refetch: fetchTransactions,
    updateTransaction,
    deleteTransaction,
    replaceTransactionTags,
    importTransactions,
    importCategorizedTransactions,
  };
}
