'use client';

import { Suspense, useState, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AppLayout, Header } from '@/components/layout';
import {
  Card,
  Button,
  Select,
  Input,
  Modal,
} from '@/components/ui';
import { ImportProgressRing } from '@/components/gamification/ImportProgressRing';
import { MonthClosedBadges } from '@/components/gamification/MonthClosedBadges';
import { useAuth, useTransactions, useCategories, useTags } from '@/hooks';
import { categoryIconToEmoji } from '@/lib/category-icons';
import {
  formatCurrency,
  formatDate,
  getMonthYearDisplay,
  getPreviousMonths,
  getLatestCompleteMonthYear,
} from '@/lib/utils';
import { transactionMatchesSearch } from '@/lib/transaction-search';
import {
  buildLearnedCategorySuggestions,
  getLearnedSuggestion,
} from '@/lib/category-suggestions';
import { CoveredSplitModal } from '@/components/covered/CoveredSplitModal';
import { addSavedFriends } from '@/lib/saved-friends';
import { ChevronDown, Lightbulb, Search, Trash2, Upload, Users, X } from 'lucide-react';
import Link from 'next/link';
import type { Transaction, BudgetOwner, CoveredSplit } from '@/types/database';

type FilterType = 'all' | 'categorized' | 'uncategorized';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function TransactionsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>('uncategorized');
  const [selectedMonth, setSelectedMonth] = useState(getLatestCompleteMonthYear());
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [budgetOwner, setBudgetOwner] = useState<BudgetOwner | ''>('');
  const [amountInput, setAmountInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [inlineSavingId, setInlineSavingId] = useState<string | null>(null);
  const [categoryUrlFilter, setCategoryUrlFilter] = useState<string | null>(null);
  const [modalTagIds, setModalTagIds] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCoveredModal, setShowCoveredModal] = useState(false);
  const [pendingSplitAction, setPendingSplitAction] = useState<
    | { type: 'set'; split: CoveredSplit; newAmount: number }
    | { type: 'remove'; originalAmount: number }
    | null
  >(null);

  const { household, profile } = useAuth();
  const currentUserName =
    profile?.role === 'person_b'
      ? household?.person_b_name
      : household?.person_a_name;
  const { tags: householdTags, createTag } = useTags({
    householdId: household?.id ?? null,
  });
  const { transactions, loading, updateTransaction, deleteTransaction, replaceTransactionTags } =
    useTransactions({
      householdId: household?.id ?? null,
      filter: 'all',
      monthYear: selectedMonth === '' ? undefined : selectedMonth,
    });
  const searchActive = globalSearch.trim().length > 0;
  const {
    transactions: allTransactionsForSearch,
    loading: searchPoolLoading,
    refetch: refetchSearchTransactions,
  } = useTransactions({
    householdId: household?.id ?? null,
    filter: 'all',
    enabled: searchActive,
  });
  const { categories } = useCategories({
    householdId: household?.id ?? null,
  });

  const { transactions: categorizedForSuggestions } = useTransactions({
    householdId: household?.id ?? null,
    filter: 'categorized',
    enabled: !!household?.id,
  });

  useEffect(() => {
    const m = searchParams.get('month');
    if (m === 'all') {
      setSelectedMonth('');
    } else if (m && /^\d{4}-\d{2}$/.test(m)) {
      setSelectedMonth(m);
    }
    const f = searchParams.get('filter');
    if (f === 'categorized' || f === 'uncategorized' || f === 'all') {
      setFilter(f);
    }
    const c = searchParams.get('category');
    if (c && UUID_RE.test(c)) {
      setCategoryUrlFilter(c);
    } else {
      setCategoryUrlFilter(null);
    }
  }, [searchParams]);

  const uncategorizedCount = useMemo(
    () => transactions.filter((t) => !t.is_categorized).length,
    [transactions]
  );

  const categorizedCount = useMemo(
    () => transactions.filter((t) => t.is_categorized).length,
    [transactions]
  );

  const displayTransactions = useMemo(() => {
    let list = transactions;
    if (filter === 'uncategorized') {
      list = list.filter((t) => !t.is_categorized);
    } else if (filter === 'categorized') {
      list = list.filter((t) => t.is_categorized);
    }
    if (categoryUrlFilter) {
      list = list.filter((t) => t.category_id === categoryUrlFilter);
    }
    return list;
  }, [transactions, filter, categoryUrlFilter]);

  const searchResults = useMemo(() => {
    if (!searchActive) return [];
    return allTransactionsForSearch.filter((t) =>
      transactionMatchesSearch(t, globalSearch)
    );
  }, [allTransactionsForSearch, globalSearch, searchActive]);

  const filteredCategoryName = useMemo(
    () => categories.find((c) => c.id === categoryUrlFilter)?.name,
    [categories, categoryUrlFilter]
  );

  const validCategoryIds = useMemo(
    () => new Set(categories.map((c) => c.id)),
    [categories]
  );

  const learnedSuggestions = useMemo(
    () => buildLearnedCategorySuggestions(categorizedForSuggestions),
    [categorizedForSuggestions]
  );

  const suggestionFor = (tx: Transaction) =>
    getLearnedSuggestion(tx, learnedSuggestions, validCategoryIds);

  const modalLearned = selectedTransaction
    ? suggestionFor(selectedTransaction)
    : undefined;
  const modalLearnedCategoryName = modalLearned
    ? categories.find((c) => c.id === modalLearned.categoryId)?.name
    : undefined;

  const ownerLabel = (o: BudgetOwner) =>
    o === 'person_a'
      ? household?.person_a_name || 'Person A'
      : o === 'person_b'
        ? household?.person_b_name || 'Person B'
        : 'Joint';

  const handleApplySuggestion = async (tx: Transaction) => {
    const s = suggestionFor(tx);
    if (!s) return;
    setInlineSavingId(tx.id);
    try {
      await updateTransaction(tx.id, {
        category_id: s.categoryId,
        budget_owner: s.budgetOwner,
      });
      if (globalSearch.trim()) {
        void refetchSearchTransactions();
      }
    } catch (error) {
      console.error('Failed to apply suggestion:', error);
    } finally {
      setInlineSavingId(null);
    }
  };

  const clearCategoryFilter = () => {
    setCategoryUrlFilter(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('category');
    const q = params.toString();
    router.replace(q ? `/transactions?${q}` : '/transactions');
  };

  const isPersonB = profile?.role === 'person_b';
  const budgetOwnerOptions = isPersonB
    ? [
        { value: 'person_b', label: household?.person_b_name || 'Person B' },
        { value: 'person_a', label: household?.person_a_name || 'Person A' },
        { value: 'joint', label: 'Joint' },
      ]
    : [
        { value: 'person_a', label: household?.person_a_name || 'Person A' },
        { value: 'person_b', label: household?.person_b_name || 'Person B' },
        { value: 'joint', label: 'Joint' },
      ];

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: `${categoryIconToEmoji(c.icon, c.name)} ${c.name}`,
  }));

  const monthOptions = [
    { value: '', label: 'All months' },
    ...getPreviousMonths(24).map((m) => ({
      value: m,
      label: getMonthYearDisplay(m),
    })),
  ];

  const handleOpenEdit = (tx: Transaction) => {
    setSelectedTransaction(tx);
    const sug = suggestionFor(tx);
    setCategoryId(tx.category_id || sug?.categoryId || '');
    setBudgetOwner(tx.budget_owner || sug?.budgetOwner || '');
    setAmountInput(String(tx.amount));
    setNotesInput(tx.notes ?? '');
    setModalTagIds(tx.tags?.map((t) => t.id) ?? []);
    setNewTagInput('');
    setSaveError('');
    setPendingSplitAction(null);
    setShowDeleteConfirm(false);
  };

  const handleAddNewTagInModal = async () => {
    const name = newTagInput.trim();
    if (!name) return;
    try {
      const tag = await createTag(name);
      setNewTagInput('');
      setModalTagIds((prev) =>
        prev.includes(tag.id) ? prev : [...prev, tag.id]
      );
    } catch (e) {
      console.error('Failed to create tag:', e);
      setSaveError('Could not create that tag.');
    }
  };

  const handleSave = async () => {
    if (!selectedTransaction || !categoryId || !budgetOwner) return;

    const parsedAmount = parseFloat(amountInput.replace(/,/g, ''));
    if (!Number.isFinite(parsedAmount)) {
      setSaveError('Enter a valid amount.');
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const updates: Parameters<typeof updateTransaction>[1] = {
        category_id: categoryId,
        budget_owner: budgetOwner as BudgetOwner,
        amount: parsedAmount,
        notes: notesInput.trim() === '' ? null : notesInput.trim(),
      };

      if (pendingSplitAction?.type === 'set') {
        updates.amount = pendingSplitAction.newAmount;
        updates.is_covered = true;
        updates.covered_split = pendingSplitAction.split;
        addSavedFriends(pendingSplitAction.split.friends.map((f) => f.name));
      } else if (pendingSplitAction?.type === 'remove') {
        updates.amount = pendingSplitAction.originalAmount;
        updates.is_covered = false;
        updates.covered_split = null;
      }

      await updateTransaction(selectedTransaction.id, updates);
      await replaceTransactionTags(selectedTransaction.id, modalTagIds);
      if (globalSearch.trim()) {
        void refetchSearchTransactions();
      }
      setSelectedTransaction(null);
      setNewTagInput('');
      setPendingSplitAction(null);
    } catch (error) {
      console.error('Failed to update transaction:', error);
      setSaveError('Could not save changes. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTransaction) return;
    setDeleting(true);
    try {
      await deleteTransaction(selectedTransaction.id);
      if (globalSearch.trim()) void refetchSearchTransactions();
      setSelectedTransaction(null);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Failed to delete transaction:', error);
      setSaveError('Could not delete transaction. Try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleInlineCategoryChange = async (tx: Transaction, value: string) => {
    setInlineSavingId(tx.id);
    try {
      await updateTransaction(tx.id, {
        category_id: value === '' ? null : value,
      });
    } catch (error) {
      console.error('Failed to update category:', error);
    } finally {
      setInlineSavingId(null);
    }
  };

  const handleInlineOwnerChange = async (tx: Transaction, value: string) => {
    setInlineSavingId(tx.id);
    try {
      await updateTransaction(tx.id, {
        budget_owner: value === '' ? null : (value as BudgetOwner),
      });
    } catch (error) {
      console.error('Failed to update owner:', error);
    } finally {
      setInlineSavingId(null);
    }
  };

  const emptyTitle = () => {
    if (transactions.length === 0) return 'No transactions';
    if (categoryUrlFilter && displayTransactions.length === 0) {
      return `No ${filteredCategoryName || 'category'} transactions`;
    }
    if (filter === 'uncategorized') return 'All caught up!';
    if (filter === 'categorized') return 'Nothing categorized yet';
    return 'No transactions this month';
  };

  const emptySubtitle = () => {
    if (transactions.length === 0) return 'Upload a CSV file to import transactions.';
    if (categoryUrlFilter && displayTransactions.length === 0) {
      return 'Try another month or clear the category filter.';
    }
    if (filter === 'uncategorized') return 'All your transactions have been categorized.';
    if (filter === 'categorized') {
      return 'Categorize items from the Uncategorized tab or import more data.';
    }
    return 'Nothing in this view for the selected month.';
  };

  const renderTransactionCard = (tx: Transaction) => {
    const learned = !tx.is_categorized ? suggestionFor(tx) : undefined;
    const learnedCategoryName = learned
      ? categories.find((c) => c.id === learned.categoryId)?.name
      : undefined;

    return (
    <Card key={tx.id} className="p-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => handleOpenEdit(tx)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpenEdit(tx);
          }
        }}
        className="cursor-pointer rounded-xl p-1 -m-1 transition-colors hover:bg-gray-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6]/30"
      >
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#14B8A6]/20 to-[#0891B2]/20">
              <span className="text-sm text-[#0891B2]">
                {tx.description.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-[15px] text-gray-900">{tx.description}</p>
              <p className="mt-0.5 text-xs text-gray-500">{formatDate(tx.date)}</p>
            </div>
          </div>
          <p className={`text-[15px] ${tx.amount < 0 ? 'text-[#10B981]' : 'text-gray-900'}`}>{formatCurrency(tx.amount)}</p>
        </div>
        <p className="px-1 text-xs text-gray-400">
          Source: {tx.credit_card?.name || 'Unknown card'} (
          {tx.paid_by === 'person_a'
            ? household?.person_a_name
            : tx.paid_by === 'person_b'
              ? household?.person_b_name
              : 'Joint'}{' '}
          paid)
        </p>
        {tx.notes && (
          <p className="mt-1 px-1 text-xs text-gray-600 line-clamp-2">{tx.notes}</p>
        )}
      </div>

      {learned && learnedCategoryName && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/90 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <Lightbulb
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
              aria-hidden
            />
            <p className="text-xs text-amber-950">
              <span className="font-medium">Suggested</span> from {learned.basedOnCount} past
              match{learned.basedOnCount === 1 ? '' : 'es'}:{' '}
              <span className="font-medium">
                {categoryIconToEmoji(
                  categories.find((c) => c.id === learned.categoryId)?.icon,
                  learnedCategoryName
                )}{' '}
                {learnedCategoryName}
              </span>
              <span className="text-amber-800"> · {ownerLabel(learned.budgetOwner)}</span>
            </p>
          </div>
          <button
            type="button"
            disabled={inlineSavingId === tx.id}
            onClick={(e) => {
              e.stopPropagation();
              void handleApplySuggestion(tx);
            }}
            className="shrink-0 rounded-lg bg-[#14B8A6] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#0D9488] disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <select
            aria-label="Category"
            disabled={inlineSavingId === tx.id}
            value={tx.category_id ?? ''}
            onChange={(e) => void handleInlineCategoryChange(tx, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-transparent bg-gray-50 py-2 pl-3 pr-8 text-left text-sm text-gray-700 hover:bg-gray-100 focus:border-[#14B8A6] focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Select category</option>
            {categoryOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
        </div>
        <div className="relative min-w-0 flex-1">
          <select
            aria-label="Budget owner"
            disabled={inlineSavingId === tx.id}
            value={tx.budget_owner ?? ''}
            onChange={(e) => void handleInlineOwnerChange(tx, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-transparent bg-gray-50 py-2 pl-3 pr-8 text-left text-sm text-gray-700 hover:bg-gray-100 focus:border-[#14B8A6] focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Select owner</option>
            {budgetOwnerOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
        </div>
      </div>
      {(tx.is_covered || (tx.tags && tx.tags.length > 0)) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {tx.is_covered && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-teal-200/90 bg-teal-50/70 px-2 py-0.5 text-[10px] font-medium text-[#0D9488]">
              <Users className="h-2.5 w-2.5" />
              group split
            </span>
          )}
          {tx.tags?.slice(0, 5).map((tag) => (
            <span
              key={tag.id}
              className="rounded-full border border-teal-200/90 bg-teal-50/70 px-2 py-0.5 text-[10px] font-medium text-[#0D9488]"
            >
              {tag.name}
            </span>
          ))}
          {tx.tags && tx.tags.length > 5 && (
            <span className="text-[10px] text-gray-500">+{tx.tags.length - 5}</span>
          )}
        </div>
      )}
    </Card>
    );
  };

  return (
    <AppLayout>
      <Header
        title="DuoFi"
        showMonthPicker
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        monthOptions={monthOptions}
      />

      <MonthClosedBadges householdId={household?.id ?? null} />
      <ImportProgressRing
        householdId={household?.id ?? null}
        onJumpToMonth={(m) => {
          setSelectedMonth(m);
          setFilter('uncategorized');
        }}
      />

      <div className="border-b border-gray-200 bg-white px-4 pb-3 pt-2">
        <div className="relative mb-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <input
            type="search"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Search all months…"
            autoComplete="off"
            className="w-full rounded-xl border border-gray-200 bg-gray-50/80 py-2.5 pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#14B8A6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/20"
            aria-label="Search transactions across all months"
          />
          {globalSearch ? (
            <button
              type="button"
              onClick={() => setGlobalSearch('')}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <p className="mb-3 text-[10px] leading-snug text-gray-500">
          Matches description, notes, date, and amount across every imported transaction for your
          household.
        </p>
        <div
          className={`flex gap-0.5 rounded-full bg-gray-100 p-1 ${
            searchActive ? 'pointer-events-none opacity-40' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => setFilter('uncategorized')}
            className={`flex-1 rounded-full py-2 px-1.5 text-center text-[11px] font-medium transition-all sm:text-xs ${
              filter === 'uncategorized'
                ? 'bg-white text-[#14B8A6] shadow-sm'
                : 'text-gray-600'
            }`}
          >
            Uncategorized ({uncategorizedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('categorized')}
            className={`flex-1 rounded-full py-2 px-1.5 text-center text-[11px] font-medium transition-all sm:text-xs ${
              filter === 'categorized'
                ? 'bg-white text-[#14B8A6] shadow-sm'
                : 'text-gray-600'
            }`}
          >
            Categorized ({categorizedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`flex-1 rounded-full py-2 px-1.5 text-center text-[11px] font-medium transition-all sm:text-xs ${
              filter === 'all'
                ? 'bg-white text-[#14B8A6] shadow-sm'
                : 'text-gray-600'
            }`}
          >
            All ({transactions.length})
          </button>
        </div>
        {categoryUrlFilter && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-teal-50 px-3 py-2 text-xs text-gray-700">
            <span>
              Category:{' '}
              <span className="font-medium">
                {categoryIconToEmoji(
                  categories.find((c) => c.id === categoryUrlFilter)?.icon,
                  filteredCategoryName || ''
                )}{' '}
                {filteredCategoryName || 'Unknown'}
              </span>
            </span>
            <button
              type="button"
              onClick={clearCategoryFilter}
              className="flex shrink-0 items-center gap-0.5 font-medium text-[#0D9488]"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-20 pt-4">
        {searchActive ? (
          searchPoolLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                <Search className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="mb-2 text-lg text-gray-900">No matches</h3>
              <p className="mb-4 text-sm text-gray-600">
                Nothing in your household matched &quot;{globalSearch.trim()}&quot; in description,
                notes, date, or amount.
              </p>
              <Button variant="outline" onClick={() => setGlobalSearch('')}>
                Clear search
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-center text-xs text-gray-500">
                {searchResults.length} result{searchResults.length === 1 ? '' : 's'} · all months
              </p>
              {searchResults.map((tx) => renderTransactionCard(tx))}
            </div>
          )
        ) : loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
          </div>
        ) : displayTransactions.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#14B8A6]/20 to-[#0891B2]/20">
              <Upload className="h-8 w-8 text-[#0891B2]" />
            </div>
            <h3 className="mb-2 text-lg text-gray-900">{emptyTitle()}</h3>
            <p className="mb-4 text-sm text-gray-600">{emptySubtitle()}</p>
            <Link href="/dashboard/upload">
              <Button>
                <Upload className="mr-2 h-4 w-4" />
                Upload CSV
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {displayTransactions.map((tx) => renderTransactionCard(tx))}
          </div>
        )}
      </div>

      <Modal
        isOpen={!!selectedTransaction}
        onClose={() => {
          setSelectedTransaction(null);
          setSaveError('');
          setNewTagInput('');
        }}
        title="Edit transaction"
      >
        {selectedTransaction && (
          <div className="space-y-4">
            {modalLearned && modalLearnedCategoryName && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/90 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <Lightbulb
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                    aria-hidden
                  />
                  <p className="text-xs text-amber-950">
                    <span className="font-medium">Suggested</span> from {modalLearned.basedOnCount}{' '}
                    past match{modalLearned.basedOnCount === 1 ? '' : 'es'}:{' '}
                    <span className="font-medium">
                      {categoryIconToEmoji(
                        categories.find((c) => c.id === modalLearned.categoryId)?.icon,
                        modalLearnedCategoryName
                      )}{' '}
                      {modalLearnedCategoryName}
                    </span>
                    <span className="text-amber-800">
                      {' '}
                      · {ownerLabel(modalLearned.budgetOwner)}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCategoryId(modalLearned.categoryId);
                    setBudgetOwner(modalLearned.budgetOwner);
                  }}
                  className="shrink-0 rounded-lg border border-amber-200/80 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm transition-colors hover:bg-amber-100/80"
                >
                  Use suggestion
                </button>
              </div>
            )}

            <div className="rounded-xl bg-gray-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#14B8A6]/20 to-[#0891B2]/20">
                  <span className="text-sm text-[#0891B2]">
                    {selectedTransaction.description.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-gray-900">{selectedTransaction.description}</p>
                  <p className="text-xs text-gray-500">{formatDate(selectedTransaction.date)}</p>
                </div>
              </div>
            </div>

            <Input
              label="Amount"
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value);
                setSaveError('');
              }}
              placeholder="0.00"
            />

            <div>
              <label
                htmlFor="tx-note"
                className="mb-2 block text-sm text-gray-600"
              >
                Note <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                id="tx-note"
                rows={3}
                value={notesInput}
                onChange={(e) => {
                  setNotesInput(e.target.value);
                  setSaveError('');
                }}
                placeholder="Memo, split detail, etc."
                className="w-full min-h-[4.5rem] resize-y rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#14B8A6] focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/20"
              />
            </div>

            <div>
              <p className="mb-1 text-sm text-gray-600">Tags</p>
              <p className="mb-2 text-xs text-gray-500">
                Optional — e.g. trip or project across categories. Select existing or create a
                new one.
              </p>
              <div className="mb-3 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/80 p-2">
                {householdTags.length === 0 ? (
                  <span className="text-xs text-gray-500">No tags yet — add one below.</span>
                ) : (
                  householdTags.map((tag) => {
                    const on = modalTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() =>
                          setModalTagIds((prev) =>
                            on
                              ? prev.filter((id) => id !== tag.id)
                              : [...prev, tag.id]
                          )
                        }
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          on
                            ? 'border-[#14B8A6] bg-teal-50 text-[#0D9488]'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {tag.name}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newTagInput}
                  onChange={(e) => {
                    setNewTagInput(e.target.value);
                    setSaveError('');
                  }}
                  placeholder="New tag name"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => void handleAddNewTagInModal()}
                  disabled={!newTagInput.trim()}
                >
                  Add
                </Button>
              </div>
            </div>

            <Select
              label="Category"
              options={categoryOptions}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              placeholder="Select category"
            />

            <Select
              label="Budget Owner"
              options={budgetOwnerOptions}
              value={budgetOwner}
              onChange={(e) => setBudgetOwner(e.target.value as BudgetOwner)}
              placeholder="Who is this expense for?"
            />

            {saveError && (
              <p className="text-sm text-[#EF4444]">{saveError}</p>
            )}

            {(() => {
              const activeSplit =
                pendingSplitAction?.type === 'set'
                  ? pendingSplitAction.split
                  : pendingSplitAction?.type === 'remove'
                    ? null
                    : selectedTransaction.covered_split;
              const isCovered =
                pendingSplitAction?.type === 'set'
                  ? true
                  : pendingSplitAction?.type === 'remove'
                    ? false
                    : selectedTransaction.is_covered;

              if (isCovered && activeSplit) {
                return (
                  <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-[#0D9488]" />
                        <span className="text-sm font-semibold text-gray-900">
                          Group Split
                          {pendingSplitAction && (
                            <span className="ml-1.5 text-xs font-normal text-amber-600">
                              (unsaved)
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        Original: {formatCurrency(activeSplit.originalAmount)}
                      </span>
                    </div>
                    <div className="divide-y divide-teal-100">
                      <div className="flex justify-between py-1.5 text-sm">
                        <span className="text-gray-700">{currentUserName || 'You'} (you)</span>
                        <span className="font-medium text-gray-900">
                          {formatCurrency(activeSplit.myShare)}
                        </span>
                      </div>
                      {activeSplit.friends.map((f) => (
                        <div key={f.name} className="flex justify-between py-1.5 text-sm">
                          <span className="text-gray-700">{f.name}</span>
                          <span className="font-medium text-gray-900">
                            {formatCurrency(f.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowCoveredModal(true)}
                        className="flex-1 rounded-lg border border-[#14B8A6] bg-white px-3 py-2 text-xs font-medium text-[#14B8A6] transition-colors hover:bg-teal-50"
                      >
                        Edit Split
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const original = activeSplit.originalAmount;
                          setPendingSplitAction({ type: 'remove', originalAmount: original });
                          setAmountInput(String(original));
                        }}
                        className="flex-1 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                      >
                        Remove Split
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <>
                  {pendingSplitAction?.type === 'remove' && (
                    <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
                      <p className="text-xs text-amber-800">
                        Group split will be removed on save
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingSplitAction(null);
                          setAmountInput(String(selectedTransaction.amount));
                        }}
                        className="text-xs font-medium text-amber-700 hover:underline"
                      >
                        Undo
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCoveredModal(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#14B8A6] bg-white px-4 py-2.5 text-sm font-medium text-[#14B8A6] transition-colors hover:bg-teal-50"
                  >
                    <Users className="h-4 w-4" />
                    I Covered This
                  </button>
                </>
              );
            })()}

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedTransaction(null);
                  setSaveError('');
                  setNewTagInput('');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                loading={saving}
                disabled={!categoryId || !budgetOwner}
                className="flex-1"
              >
                Save
              </Button>
            </div>

            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center justify-center gap-1.5 w-full text-xs text-gray-400 hover:text-red-500 pt-2 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete transaction
              </button>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 mt-1">
                <p className="text-sm text-red-700 mb-2">
                  Are you sure? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 text-xs"
                  >
                    Keep
                  </Button>
                  <Button
                    onClick={handleDelete}
                    loading={deleting}
                    className="flex-1 text-xs !bg-red-600 hover:!bg-red-700"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {selectedTransaction && (
        <CoveredSplitModal
          isOpen={showCoveredModal}
          onClose={() => setShowCoveredModal(false)}
          transaction={
            pendingSplitAction?.type === 'set'
              ? {
                  ...selectedTransaction,
                  is_covered: true,
                  covered_split: pendingSplitAction.split,
                  amount: pendingSplitAction.newAmount,
                }
              : pendingSplitAction?.type === 'remove'
                ? {
                    ...selectedTransaction,
                    is_covered: false,
                    covered_split: null,
                    amount: pendingSplitAction.originalAmount,
                  }
                : selectedTransaction
          }
          userName={currentUserName || 'You'}
          onConfirm={(split: CoveredSplit, newAmount: number) => {
            const role = profile?.role === 'person_b' ? 'person_b' as const : 'person_a' as const;
            setPendingSplitAction({
              type: 'set',
              split: { ...split, coveredBy: role },
              newAmount,
            });
            setAmountInput(String(newAmount));
            setShowCoveredModal(false);
          }}
        />
      )}
    </AppLayout>
  );
}

function TransactionsFallback() {
  return (
    <AppLayout>
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
      </div>
    </AppLayout>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<TransactionsFallback />}>
      <TransactionsPageContent />
    </Suspense>
  );
}
