'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { AppLayout, Header } from '@/components/layout';
import {
  Card,
  CardContent,
  Button,
  Select,
  Input,
  Modal,
  ProgressBar,
} from '@/components/ui';
import {
  useAuth,
  useBudgets,
  useCategories,
  useTransactions,
  useBudgetSuggestions,
  useTags,
} from '@/hooks';
import {
  formatCurrency,
  formatDate,
  getLatestCompleteMonthYear,
  getMonthYearDisplay,
  getPreviousMonths,
  getChartMonthWindow,
  CHART_MONTH_MAX_OFFSET,
} from '@/lib/utils';
import { SpendingMoMChart, type MoMChartMode } from '@/components/budget/SpendingMoMChart';
import { categoryIconToEmoji } from '@/lib/category-icons';
import { ChevronDown, Edit2, Tag, Lightbulb } from 'lucide-react';
import Link from 'next/link';
import type { BudgetOwner, Category, Transaction } from '@/types/database';

interface BudgetSummary {
  category: Category;
  personA: { goal: number; spent: number };
  personB: { goal: number; spent: number };
  joint: { goal: number; spent: number };
}

type ModalType = 'budget' | null;

const BUDGET_SUGGESTIONS_HIDE_KEY = 'duofi_hide_budget_suggestions';

function BudgetOverviewTransactionList({
  transactions,
  categories,
  monthDisplay,
  emptyLabel,
  ownerLabelFor,
}: {
  transactions: Transaction[];
  categories: Category[];
  monthDisplay: string;
  emptyLabel: string;
  /** When set (e.g. total share view), show personal vs joint on each row. */
  ownerLabelFor?: (t: Transaction) => string | null;
}) {
  const rowCategory = (t: Transaction): Category | undefined => {
    if (t.category && typeof t.category === 'object' && 'id' in t.category) {
      return t.category as Category;
    }
    return categories.find((c) => c.id === t.category_id);
  };

  if (transactions.length === 0) {
    return <p className="py-2 text-sm text-gray-500">{emptyLabel}</p>;
  }

  return (
    <ul
      className="max-h-[min(22rem,55vh)] space-y-2 overflow-y-auto pr-0.5"
      aria-label={`Categorized transactions for ${monthDisplay}`}
    >
      {transactions.map((t) => {
        const cat = rowCategory(t);
        const catName = cat?.name ?? 'Category';
        const ownerBit = ownerLabelFor?.(t);
        return (
          <li
            key={t.id}
            className="flex gap-2 rounded-lg bg-gray-50/90 px-2.5 py-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-gray-900">{t.description}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                {cat ? (
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center text-sm leading-none"
                    aria-hidden
                  >
                    {categoryIconToEmoji(cat.icon, cat.name)}
                  </span>
                ) : null}
                <span className="min-w-0 truncate">
                  {formatDate(t.date)}
                  {ownerBit ? ` · ${ownerBit}` : ''} · {catName}
                </span>
              </p>
            </div>
            <span className="shrink-0 font-semibold tabular-nums text-gray-900">
              {formatCurrency(t.amount)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function BudgetPage() {
  const [selectedPerson, setSelectedPerson] = useState<'A' | 'B'>('A');
  const [selectedMonth, setSelectedMonth] = useState(getLatestCompleteMonthYear());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  
  // Budget form state
  const [personAGoal, setPersonAGoal] = useState('');
  const [personBGoal, setPersonBGoal] = useState('');
  const [jointGoal, setJointGoal] = useState('');
  
  const [hideBudgetSuggestions, setHideBudgetSuggestions] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [chartMode, setChartMode] = useState<MoMChartMode>('personal');
  const [chartWindowOffset, setChartWindowOffset] = useState(0);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);

  const { household, profile } = useAuth();
  const isPersonB = profile?.role === 'person_b';
  const defaultedRef = useRef(false);
  useEffect(() => {
    if (profile && !defaultedRef.current) {
      defaultedRef.current = true;
      if (profile.role === 'person_b') setSelectedPerson('B');
    }
  }, [profile]);
  const { tags: householdTags } = useTags({ householdId: household?.id ?? null });

  useEffect(() => {
    try {
      setHideBudgetSuggestions(localStorage.getItem(BUDGET_SUGGESTIONS_HIDE_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  const budgetSuggestions = useBudgetSuggestions({
    householdId: household?.id ?? null,
    categoryId: editingCategory?.id ?? null,
    monthYear: selectedMonth,
    enabled: modalType === 'budget' && !!editingCategory && !hideBudgetSuggestions,
  });

  const { keys: chartMonthKeys, dateFrom: chartDateFrom, dateTo: chartDateTo } = useMemo(
    () => getChartMonthWindow(chartWindowOffset),
    [chartWindowOffset]
  );

  const shiftChartWindow = (delta: number) => {
    setChartWindowOffset((o) =>
      Math.min(CHART_MONTH_MAX_OFFSET, Math.max(0, o + delta))
    );
  };

  const tagFilterIds = filterTagIds.length > 0 ? filterTagIds : undefined;
  const toggleFilterTag = (tagId: string) => {
    setFilterTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const { transactions: chartTransactions, loading: chartTxLoading } = useTransactions({
    householdId: household?.id ?? null,
    filter: 'categorized',
    dateFrom: chartDateFrom,
    dateTo: chartDateTo,
    tagFilterIds,
  });
  const { budgets, loading: budgetsLoading, upsertBudget } = useBudgets({
    householdId: household?.id ?? null,
    monthYear: selectedMonth,
  });
  const { categories, loading: categoriesLoading } = useCategories({
    householdId: household?.id ?? null,
  });
  const { transactions, loading: txLoading } = useTransactions({
    householdId: household?.id ?? null,
    filter: 'categorized',
    monthYear: selectedMonth,
    tagFilterIds,
  });

  const monthOptions = getPreviousMonths(24).map((m) => ({
    value: m,
    label: getMonthYearDisplay(m),
  }));

  const budgetSummary = useMemo<BudgetSummary[]>(() => {
    return categories.map((category) => {
      const categoryBudgets = budgets.filter((b) => b.category_id === category.id);
      const categoryTx = transactions.filter((t) => t.category_id === category.id);

      const getGoal = (owner: BudgetOwner) =>
        categoryBudgets.find((b) => b.budget_owner === owner)?.goal_amount || 0;

      const getSpent = (owner: BudgetOwner) =>
        categoryTx
          .filter((t) => t.budget_owner === owner)
          .reduce((sum, t) => sum + t.amount, 0);

      return {
        category,
        personA: { goal: getGoal('person_a'), spent: getSpent('person_a') },
        personB: { goal: getGoal('person_b'), spent: getSpent('person_b') },
        joint: { goal: getGoal('joint'), spent: getSpent('joint') },
      };
    });
  }, [categories, budgets, transactions]);

  const totals = useMemo(() => {
    return budgetSummary.reduce(
      (acc, s) => ({
        personA: {
          goal: acc.personA.goal + s.personA.goal,
          spent: acc.personA.spent + s.personA.spent,
        },
        personB: {
          goal: acc.personB.goal + s.personB.goal,
          spent: acc.personB.spent + s.personB.spent,
        },
        joint: {
          goal: acc.joint.goal + s.joint.goal,
          spent: acc.joint.spent + s.joint.spent,
        },
      }),
      {
        personA: { goal: 0, spent: 0 },
        personB: { goal: 0, spent: 0 },
        joint: { goal: 0, spent: 0 },
      }
    );
  }, [budgetSummary]);

  const personalBudgetOwner: BudgetOwner =
    selectedPerson === 'A' ? 'person_a' : 'person_b';

  const personalTransactionsThisMonth = useMemo(() => {
    return transactions
      .filter((t) => t.budget_owner === personalBudgetOwner)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [transactions, personalBudgetOwner]);

  const jointTransactionsThisMonth = useMemo(() => {
    return transactions
      .filter((t) => t.budget_owner === 'joint')
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [transactions]);

  const overviewTransactionsThisMonth = useMemo(() => {
    if (chartMode === 'personal') return personalTransactionsThisMonth;
    if (chartMode === 'joint') return jointTransactionsThisMonth;
    return [...personalTransactionsThisMonth, ...jointTransactionsThisMonth]
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [chartMode, personalTransactionsThisMonth, jointTransactionsThisMonth]);

  const transactionsCardCopy = (() => {
    const monthLabel = getMonthYearDisplay(selectedMonth);
    const personName =
      selectedPerson === 'A'
        ? household?.person_a_name || 'Person A'
        : household?.person_b_name || 'Person B';
    if (chartMode === 'personal') {
      return {
        subtitle: `Categorized as ${personName}'s spending for ${monthLabel}.`,
        empty: 'No personal categorized transactions this month.',
      };
    }
    if (chartMode === 'joint') {
      return {
        subtitle: `Categorized as joint spending for ${monthLabel}.`,
        empty: 'No joint categorized transactions this month.',
      };
    }
    return {
      subtitle: `${personName}'s personal spending and all joint spending for ${monthLabel}.`,
      empty: 'No categorized personal or joint transactions this month.',
    };
  })();

  const getPersonTotal = () => {
    const individualSpent = selectedPerson === 'A' ? totals.personA.spent : totals.personB.spent;
    const individualTotal = selectedPerson === 'A' ? totals.personA.goal : totals.personB.goal;
    const halfJoint = totals.joint.spent / 2;
    const halfJointBudget = totals.joint.goal / 2;
    const totalSpent = individualSpent + halfJoint;
    const totalBudget = individualTotal + halfJointBudget;
    const percentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    return {
      spent: totalSpent,
      total: totalBudget,
      percentage: Math.round(percentage),
    };
  };

  const currentPersonData = selectedPerson === 'A' ? totals.personA : totals.personB;
  const personTotal = getPersonTotal();

  const getStatusText = (percentage: number) => {
    if (percentage >= 100) return { text: 'Over Budget', color: 'text-[#EF4444]' };
    if (percentage >= 90) return { text: 'Near Limit', color: 'text-[#F59E0B]' };
    return { text: 'On Track', color: 'text-[#10B981]' };
  };

  const handleOpenBudgetEdit = (category: Category) => {
    const summary = budgetSummary.find((s) => s.category.id === category.id);
    setEditingCategory(category);
    setPersonAGoal(summary?.personA.goal.toString() || '0');
    setPersonBGoal(summary?.personB.goal.toString() || '0');
    setJointGoal(summary?.joint.goal.toString() || '0');
    setError('');
    setModalType('budget');
  };

  const handleSaveBudget = async () => {
    if (!editingCategory) return;

    setSaving(true);
    setError('');
    
    try {
      const promises: Promise<unknown>[] = [];
      promises.push(upsertBudget(editingCategory.id, 'person_a', parseFloat(personAGoal) || 0));
      promises.push(upsertBudget(editingCategory.id, 'person_b', parseFloat(personBGoal) || 0));
      promises.push(upsertBudget(editingCategory.id, 'joint', parseFloat(jointGoal) || 0));
      await Promise.all(promises);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save budgets');
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setModalType(null);
    setEditingCategory(null);
    setPersonAGoal('');
    setPersonBGoal('');
    setJointGoal('');
    setError('');
  };

  const loading = budgetsLoading || categoriesLoading || txLoading;
  const personalStatus = getStatusText(currentPersonData.goal > 0 ? (currentPersonData.spent / currentPersonData.goal) * 100 : 0);
  const jointStatus = getStatusText(totals.joint.goal > 0 ? (totals.joint.spent / totals.joint.goal) * 100 : 0);

  const renderBudgetSuggestion = (
    owner: 'person_a' | 'person_b' | 'joint',
    apply: (v: string) => void
  ) => {
    if (hideBudgetSuggestions || budgetSuggestions.loading) return null;
    const s = budgetSuggestions[owner];
    if (!s) return null;
    const src = s.source === 'goal_trend' ? 'past goal trend' : 'avg. monthly spend';
    return (
      <p className="-mt-1 mb-1.5 text-xs text-gray-500">
        Suggested {formatCurrency(s.amount)} ({src}){' '}
        <button
          type="button"
          className="font-medium text-[#14B8A6] hover:text-[#0D9488]"
          onClick={() => apply(String(s.amount))}
        >
          Apply
        </button>
      </p>
    );
  };

  return (
    <AppLayout>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 pt-3 pb-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl tracking-tight text-gray-900">DuoFi</h1>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowMonthPicker(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <span className="text-sm text-gray-700">
                {getMonthYearDisplay(selectedMonth)}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </button>
            <Link
              href="/dashboard/settings#all-categories"
              className="flex h-8 w-8 items-center justify-center rounded-full gradient-primary"
              aria-label="All categories and category settings"
            >
              <Tag className="h-4 w-4 text-white" />
            </Link>
          </div>
        </div>
        <button 
          onClick={() => {
            if (categories.length > 0) {
              handleOpenBudgetEdit(categories[0]);
            }
          }}
          className="w-full py-2.5 px-4 bg-[#14B8A6] hover:bg-[#0D9488] text-white rounded-lg text-sm transition-colors"
        >
          Set/Edit Goals
        </button>
      </div>

      {/* Dashboard Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-20">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
              <p className="text-xs font-medium text-gray-800">Filter overview by tag</p>
              <p className="mt-0.5 text-[11px] text-gray-500">
                Totals and the chart use only transactions that match{' '}
                <span className="font-medium">any</span> selected tag. Clear filters to see
                everything.
              </p>
              {householdTags.length === 0 ? (
                <p className="mt-2 text-[11px] text-gray-500">
                  Add tags on the Transactions page (for example a trip name), then filter your
                  budget view here.
                </p>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {householdTags.map((tag) => {
                      const active = filterTagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleFilterTag(tag.id)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            active
                              ? 'border-[#14B8A6] bg-teal-50 text-[#0D9488]'
                              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                  {filterTagIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterTagIds([])}
                      className="mt-2 text-[11px] font-medium text-[#14B8A6] hover:text-[#0D9488]"
                    >
                      Clear tag filters
                    </button>
                  )}
                </>
              )}
            </div>
            {/* Month-over-month spending */}
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => setChartMode('personal')}
                  className={`flex-1 min-w-[5.5rem] rounded-lg px-2 py-2 text-center text-xs font-medium transition-all sm:text-sm ${
                    chartMode === 'personal'
                      ? 'bg-white text-[#0D9488] shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Personal
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('joint')}
                  className={`flex-1 min-w-[4rem] rounded-lg px-2 py-2 text-center text-xs font-medium transition-all sm:text-sm ${
                    chartMode === 'joint'
                      ? 'bg-white text-[#0D9488] shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Joint
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('total_share')}
                  className={`flex-1 min-w-[5rem] rounded-lg px-2 py-2 text-center text-xs font-medium transition-all sm:text-sm ${
                    chartMode === 'total_share'
                      ? 'bg-white text-[#0D9488] shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Total share
                </button>
              </div>
              <p className="text-xs text-gray-500 px-0.5">
                Personal / Joint / Total share also controls which budget cards and transaction list
                you see below. Total share stacks personal plus your half of joint on the chart (use
                A/B for whose view). Use the arrows on the chart to move the 12-month window.
              </p>
              <SpendingMoMChart
                transactions={chartTransactions}
                monthKeys={chartMonthKeys}
                chartMode={chartMode}
                selectedPerson={selectedPerson}
                selectedMonth={selectedMonth}
                onSelectMonth={setSelectedMonth}
                personAName={household?.person_a_name || 'Person A'}
                personBName={household?.person_b_name || 'Person B'}
                loading={chartTxLoading}
                chartWindowOffset={chartWindowOffset}
                onShiftChartWindow={shiftChartWindow}
              />
            </div>

            {/* Person Toggle */}
            <div className="flex bg-white rounded-xl p-1 shadow-sm border border-gray-100">
              {([
                isPersonB ? 'B' : 'A',
                isPersonB ? 'A' : 'B',
              ] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setSelectedPerson(key)}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-sm transition-all ${
                    selectedPerson === key
                      ? 'bg-[#14B8A6] text-white shadow-sm'
                      : 'text-gray-600'
                  }`}
                >
                  {key === 'A'
                    ? household?.person_a_name || 'Person A'
                    : household?.person_b_name || 'Person B'}
                </button>
              ))}
            </div>

            {/* Overall Total Card */}
            <Card gradient className="p-5">
              <p className="text-sm text-white/80 mb-1">
                Total Spending ({getMonthYearDisplay(selectedMonth)})
              </p>
              <h2 className="text-3xl text-white mb-1">
                {formatCurrency(personTotal.spent)}
              </h2>
              <p className="text-sm text-white/80">
                of {formatCurrency(personTotal.total)} ({personTotal.percentage}%)
              </p>
              <p className="text-xs text-white/70 mt-2">
                Personal + Half of Joint
              </p>
            </Card>

            {/* Suggested Budget */}
            {personTotal.total === 0 && (
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Lightbulb className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm text-amber-900 mb-1">Set Your Budget Goals</h3>
                    <p className="text-xs text-amber-700">
                      Tap a category to see transactions for the month, or the pencil to set budget goals.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Personal Budget Card */}
            {(chartMode === 'personal' || chartMode === 'total_share') && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base text-gray-900">Personal Budget</h2>
                <span className={`text-xs ${personalStatus.color}`}>
                  {personalStatus.text}
                </span>
              </div>

              <div className="mb-4 space-y-1 rounded-lg bg-gray-50 px-3 py-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Total spent (personal)</span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(currentPersonData.spent)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Total budget (personal)</span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(currentPersonData.goal)}
                  </span>
                </div>
              </div>

              {currentPersonData.goal > 0 && (
                <>
                  <ProgressBar
                    value={currentPersonData.spent}
                    max={currentPersonData.goal}
                    className="mb-3"
                  />
                  <div className="flex items-baseline justify-between mb-4">
                    <div>
                      <span className="text-2xl text-gray-900">
                        {formatCurrency(currentPersonData.spent)}
                      </span>
                      <span className="text-sm text-gray-500 ml-1">
                        of {formatCurrency(currentPersonData.goal)}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {currentPersonData.goal > 0
                        ? Math.round((currentPersonData.spent / currentPersonData.goal) * 100)
                        : 0}%
                    </span>
                  </div>
                </>
              )}

              {/* Category Breakdown */}
              <div className="space-y-3 pt-3 border-t border-gray-100">
                {budgetSummary
                  .filter((s) => {
                    const data = selectedPerson === 'A' ? s.personA : s.personB;
                    return data.goal > 0 || data.spent > 0;
                  })
                  .map((summary) => {
                    const data = selectedPerson === 'A' ? summary.personA : summary.personB;
                    const owner = selectedPerson === 'A' ? 'person_a' : 'person_b';
                    const drillHref = `/budget/category/${summary.category.id}?month=${encodeURIComponent(selectedMonth)}&owner=${owner}`;
                    return (
                      <div
                        key={summary.category.id}
                        className="flex items-stretch gap-1 rounded-lg hover:bg-gray-50/80"
                      >
                        <Link
                          href={drillHref}
                          className="min-w-0 flex-1 py-1 pl-1 pr-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6] focus-visible:ring-offset-1 rounded-lg"
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2 text-sm text-gray-700">
                              <span
                                className="flex h-8 w-8 shrink-0 items-center justify-center text-lg leading-none"
                                aria-hidden
                              >
                                {categoryIconToEmoji(summary.category.icon, summary.category.name)}
                              </span>
                              <span className="truncate">{summary.category.name}</span>
                            </span>
                            <span className="shrink-0 text-xs text-gray-500">
                              {formatCurrency(data.spent)} / {formatCurrency(data.goal)}
                            </span>
                          </div>
                          <ProgressBar value={data.spent} max={data.goal} size="sm" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleOpenBudgetEdit(summary.category)}
                          className="shrink-0 self-center rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-[#14B8A6]"
                          aria-label={`Set budget for ${summary.category.name}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                {budgetSummary.filter((s) => {
                  const data = selectedPerson === 'A' ? s.personA : s.personB;
                  return data.goal > 0 || data.spent > 0;
                }).length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-2">
                    No personal budgets set. Tap a category to add one.
                  </p>
                )}
              </div>
            </Card>
            )}

            {/* Joint Budget Card */}
            {(chartMode === 'joint' || chartMode === 'total_share') && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base text-gray-900">Joint Budget</h2>
                <span className={`text-xs ${jointStatus.color}`}>
                  {jointStatus.text}
                </span>
              </div>

              <div className="mb-4 space-y-1 rounded-lg bg-gray-50 px-3 py-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Total spent (joint)</span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(totals.joint.spent)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Total budget (joint)</span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(totals.joint.goal)}
                  </span>
                </div>
              </div>

              {totals.joint.goal > 0 && (
                <>
                  <ProgressBar
                    value={totals.joint.spent}
                    max={totals.joint.goal}
                    className="mb-3"
                  />
                  <div className="flex items-baseline justify-between mb-4">
                    <div>
                      <span className="text-2xl text-gray-900">
                        {formatCurrency(totals.joint.spent)}
                      </span>
                      <span className="text-sm text-gray-500 ml-1">
                        of {formatCurrency(totals.joint.goal)}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {totals.joint.goal > 0
                        ? Math.round((totals.joint.spent / totals.joint.goal) * 100)
                        : 0}%
                    </span>
                  </div>
                </>
              )}

              {/* Category Breakdown */}
              <div className="space-y-3 pt-3 border-t border-gray-100">
                {budgetSummary
                  .filter((s) => s.joint.goal > 0 || s.joint.spent > 0)
                  .map((summary) => {
                    const drillHref = `/budget/category/${summary.category.id}?month=${encodeURIComponent(selectedMonth)}&owner=joint`;
                    return (
                      <div
                        key={summary.category.id}
                        className="flex items-stretch gap-1 rounded-lg hover:bg-gray-50/80"
                      >
                        <Link
                          href={drillHref}
                          className="min-w-0 flex-1 py-1 pl-1 pr-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6] focus-visible:ring-offset-1 rounded-lg"
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2 text-sm text-gray-700">
                              <span
                                className="flex h-8 w-8 shrink-0 items-center justify-center text-lg leading-none"
                                aria-hidden
                              >
                                {categoryIconToEmoji(summary.category.icon, summary.category.name)}
                              </span>
                              <span className="truncate">{summary.category.name}</span>
                            </span>
                            <span className="shrink-0 text-xs text-gray-500">
                              {formatCurrency(summary.joint.spent)} /{' '}
                              {formatCurrency(summary.joint.goal)}
                            </span>
                          </div>
                          <ProgressBar value={summary.joint.spent} max={summary.joint.goal} size="sm" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleOpenBudgetEdit(summary.category)}
                          className="shrink-0 self-center rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-[#14B8A6]"
                          aria-label={`Set budget for ${summary.category.name}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                {budgetSummary.filter((s) => s.joint.goal > 0 || s.joint.spent > 0).length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-2">
                    No joint budgets set. Tap a category to add one.
                  </p>
                )}
              </div>

              <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                Your share: {formatCurrency(totals.joint.spent / 2)} (50%)
              </p>
            </Card>
            )}

            {/* Transactions (month list follows Personal / Joint / Total share mode) */}
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-base text-gray-900">Transactions</h2>
                <span className="shrink-0 text-xs text-gray-500">
                  {getMonthYearDisplay(selectedMonth)}
                </span>
              </div>
              <p className="mb-3 text-[11px] text-gray-500">{transactionsCardCopy.subtitle}</p>
              <BudgetOverviewTransactionList
                transactions={overviewTransactionsThisMonth}
                categories={categories}
                monthDisplay={getMonthYearDisplay(selectedMonth)}
                emptyLabel={transactionsCardCopy.empty}
                ownerLabelFor={
                  chartMode === 'total_share'
                    ? (t) => {
                        if (t.budget_owner === 'joint') return 'Joint';
                        if (t.budget_owner === 'person_a') {
                          return household?.person_a_name || 'Person A';
                        }
                        if (t.budget_owner === 'person_b') {
                          return household?.person_b_name || 'Person B';
                        }
                        return null;
                      }
                    : undefined
                }
              />
            </Card>

          </div>
        )}
      </div>

      {/* Month Picker Modal */}
      <Modal
        isOpen={showMonthPicker}
        onClose={() => setShowMonthPicker(false)}
        title="Select Month"
      >
        <div className="space-y-2">
          {monthOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                setSelectedMonth(option.value);
                setShowMonthPicker(false);
              }}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                selectedMonth === option.value
                  ? 'bg-[#14B8A6] text-white'
                  : 'hover:bg-gray-50 text-gray-900'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Modal>

      {/* Edit Budget Modal */}
      <Modal
        isOpen={modalType === 'budget'}
        onClose={closeModal}
        title={`Set Budget: ${editingCategory?.name}`}
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-[#EF4444]">
              {error}
            </div>
          )}

          <p className="text-sm text-gray-500">
            Set monthly budget goals for {getMonthYearDisplay(selectedMonth)}.
            Set to 0 to clear a budget.
          </p>

          {!hideBudgetSuggestions && (
            <div className="rounded-lg border border-teal-100 bg-teal-50/90 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-gray-600">
                  Suggestions use how your goals moved month-to-month when you have history; otherwise
                  typical spending in this category over the prior 12 months.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.setItem(BUDGET_SUGGESTIONS_HIDE_KEY, '1');
                    } catch {
                      /* ignore */
                    }
                    setHideBudgetSuggestions(true);
                  }}
                  className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-800"
                >
                  Dismiss
                </button>
              </div>
              {budgetSuggestions.loading ? (
                <p className="mt-2 text-xs text-gray-500">Calculating…</p>
              ) : (
                !budgetSuggestions.person_a &&
                !budgetSuggestions.person_b &&
                !budgetSuggestions.joint && (
                  <p className="mt-2 text-xs text-gray-500">
                    No suggestion yet — add past monthly goals or spending in this category to get a
                    number.
                  </p>
                )
              )}
            </div>
          )}

          {hideBudgetSuggestions && (
            <button
              type="button"
              className="text-xs text-[#14B8A6] hover:underline"
              onClick={() => {
                try {
                  localStorage.removeItem(BUDGET_SUGGESTIONS_HIDE_KEY);
                } catch {
                  /* ignore */
                }
                setHideBudgetSuggestions(false);
              }}
            >
              Show budget suggestions again
            </button>
          )}

          <div>
            <label htmlFor="budget-goal-pa" className="mb-2 block text-sm text-gray-600">
              {household?.person_a_name || 'Person A'}&apos;s Budget
            </label>
            {renderBudgetSuggestion('person_a', setPersonAGoal)}
            <Input
              id="budget-goal-pa"
              type="number"
              min="0"
              step="0.01"
              value={personAGoal}
              onChange={(e) => setPersonAGoal(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <label htmlFor="budget-goal-pb" className="mb-2 block text-sm text-gray-600">
              {household?.person_b_name || 'Person B'}&apos;s Budget
            </label>
            {renderBudgetSuggestion('person_b', setPersonBGoal)}
            <Input
              id="budget-goal-pb"
              type="number"
              min="0"
              step="0.01"
              value={personBGoal}
              onChange={(e) => setPersonBGoal(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <label htmlFor="budget-goal-joint" className="mb-2 block text-sm text-gray-600">
              Joint Budget
            </label>
            {renderBudgetSuggestion('joint', setJointGoal)}
            <Input
              id="budget-goal-joint"
              type="number"
              min="0"
              step="0.01"
              value={jointGoal}
              onChange={(e) => setJointGoal(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={closeModal} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSaveBudget} loading={saving} className="flex-1">
              Save Budget
            </Button>
          </div>
        </div>
      </Modal>

    </AppLayout>
  );
}
