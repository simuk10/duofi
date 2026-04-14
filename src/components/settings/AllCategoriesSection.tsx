'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Card, Button, Input, Modal } from '@/components/ui';
import {
  useAuth,
  useBudgets,
  useCategories,
  useTransactions,
  useBudgetSuggestions,
} from '@/hooks';
import {
  formatCurrency,
  getLatestCompleteMonthYear,
  getMonthYearDisplay,
  getPreviousMonths,
} from '@/lib/utils';
import {
  CATEGORY_ICON_OPTIONS,
  categoryIconToEmoji,
  suggestEmojiFromCategoryName,
} from '@/lib/category-icons';
import { ChevronDown, Plus, Trash2, Settings } from 'lucide-react';
import type { BudgetOwner, Category } from '@/types/database';

interface BudgetSummary {
  category: Category;
  personA: { goal: number; spent: number };
  personB: { goal: number; spent: number };
  joint: { goal: number; spent: number };
}

type ModalType = 'budget' | 'category' | 'month-picker' | null;

const DEFAULT_CATEGORY_COLOR = '#14B8A6';
const BUDGET_SUGGESTIONS_HIDE_KEY = 'duofi_hide_budget_suggestions';

export function AllCategoriesSection() {
  const [selectedMonth, setSelectedMonth] = useState(getLatestCompleteMonthYear());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const [personAGoal, setPersonAGoal] = useState('');
  const [personBGoal, setPersonBGoal] = useState('');
  const [jointGoal, setJointGoal] = useState('');

  const [categoryName, setCategoryName] = useState('');
  const [categoryIcon, setCategoryIcon] = useState('📁');
  const iconUserPickedRef = useRef(false);
  const [hideBudgetSuggestions, setHideBudgetSuggestions] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { household } = useAuth();

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

  const { budgets, loading: budgetsLoading, upsertBudget } = useBudgets({
    householdId: household?.id ?? null,
    monthYear: selectedMonth,
  });
  const {
    categories,
    loading: categoriesLoading,
    createCategory,
    updateCategory,
    deleteCategory,
  } = useCategories({
    householdId: household?.id ?? null,
  });
  const { transactions, loading: txLoading } = useTransactions({
    householdId: household?.id ?? null,
    filter: 'categorized',
    monthYear: selectedMonth,
  });

  const monthOptions = getPreviousMonths(24).map((m) => ({
    value: m,
    label: getMonthYearDisplay(m),
  }));

  useEffect(() => {
    if (modalType !== 'category' || editingCategory) return;
    if (!iconUserPickedRef.current && categoryName.trim()) {
      setCategoryIcon(suggestEmojiFromCategoryName(categoryName));
    }
  }, [categoryName, modalType, editingCategory]);

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

  const handleOpenBudgetEdit = (category: Category) => {
    const summary = budgetSummary.find((s) => s.category.id === category.id);
    setEditingCategory(category);
    setPersonAGoal(summary?.personA.goal.toString() || '0');
    setPersonBGoal(summary?.personB.goal.toString() || '0');
    setJointGoal(summary?.joint.goal.toString() || '0');
    setError('');
    setModalType('budget');
  };

  const handleOpenCategoryEdit = (category?: Category) => {
    iconUserPickedRef.current = false;
    if (category) {
      setEditingCategory(category);
      setCategoryName(category.name);
      setCategoryIcon(categoryIconToEmoji(category.icon, category.name));
    } else {
      setEditingCategory(null);
      setCategoryName('');
      setCategoryIcon('📁');
    }
    setError('');
    setModalType('category');
  };

  const handleSaveBudget = async () => {
    if (!editingCategory) return;

    setSaving(true);
    setError('');

    try {
      await Promise.all([
        upsertBudget(editingCategory.id, 'person_a', parseFloat(personAGoal) || 0),
        upsertBudget(editingCategory.id, 'person_b', parseFloat(personBGoal) || 0),
        upsertBudget(editingCategory.id, 'joint', parseFloat(jointGoal) || 0),
      ]);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save budgets');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      setError('Category name is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, {
          name: categoryName.trim(),
          icon: categoryIcon,
        });
      } else {
        await createCategory(categoryName.trim(), DEFAULT_CATEGORY_COLOR, categoryIcon);
      }
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    if (!confirm(`Are you sure you want to delete "${category.name}"?`)) return;
    try {
      await deleteCategory(category.id);
    } catch (err) {
      console.error('Failed to delete category:', err);
    }
  };

  const closeModal = () => {
    setModalType(null);
    setEditingCategory(null);
    setPersonAGoal('');
    setPersonBGoal('');
    setJointGoal('');
    setCategoryName('');
    setCategoryIcon('📁');
    iconUserPickedRef.current = false;
    setError('');
  };

  const loading = budgetsLoading || categoriesLoading || txLoading;

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
    <>
      <Card className="p-5" id="all-categories">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base text-gray-900">All Categories</h2>
          <button
            type="button"
            onClick={() => handleOpenCategoryEdit()}
            className="flex items-center gap-1 text-sm text-[#14B8A6] hover:text-[#0D9488]"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500">
            Goals apply to the selected month. Tap a row for budgets; the gear edits name and icon.
          </p>
          <button
            type="button"
            onClick={() => setShowMonthPicker(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            {getMonthYearDisplay(selectedMonth)}
            <ChevronDown className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center gap-2 rounded-lg transition-colors hover:bg-gray-50"
                >
                  <button
                    type="button"
                    onClick={() => handleOpenBudgetEdit(category)}
                    className="flex flex-1 items-center justify-between p-3 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center text-xl">
                        {categoryIconToEmoji(category.icon, category.name)}
                      </span>
                      <span className="text-sm text-gray-900">{category.name}</span>
                    </div>
                    <ChevronDown className="h-4 w-4 -rotate-90 text-gray-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenCategoryEdit(category)}
                    className="p-3 text-gray-400 hover:text-gray-600"
                    aria-label={`Edit ${category.name}`}
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Modal
        isOpen={showMonthPicker}
        onClose={() => setShowMonthPicker(false)}
        title="Select month for goals"
      >
        <div className="space-y-2">
          {monthOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setSelectedMonth(option.value);
                setShowMonthPicker(false);
              }}
              className={`w-full rounded-lg px-4 py-3 text-left transition-colors ${
                selectedMonth === option.value
                  ? 'bg-[#14B8A6] text-white'
                  : 'text-gray-900 hover:bg-gray-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        isOpen={modalType === 'budget'}
        onClose={closeModal}
        title={`Set Budget: ${editingCategory?.name}`}
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-[#EF4444]">{error}</div>
          )}

          <p className="text-sm text-gray-500">
            Set monthly budget goals for {getMonthYearDisplay(selectedMonth)}. Set to 0 to clear a
            budget.
          </p>

          {!hideBudgetSuggestions && (
            <div className="rounded-lg border border-teal-100 bg-teal-50/90 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-gray-600">
                  Suggestions use how your goals moved month-to-month when you have history;
                  otherwise typical spending in this category over the prior 12 months.
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
                    No suggestion yet — add past monthly goals or spending in this category to get
                    a number.
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
            <label htmlFor="settings-budget-goal-pa" className="mb-2 block text-sm text-gray-600">
              {household?.person_a_name || 'Person A'}&apos;s Budget
            </label>
            {renderBudgetSuggestion('person_a', setPersonAGoal)}
            <Input
              id="settings-budget-goal-pa"
              type="number"
              min="0"
              step="0.01"
              value={personAGoal}
              onChange={(e) => setPersonAGoal(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <label htmlFor="settings-budget-goal-pb" className="mb-2 block text-sm text-gray-600">
              {household?.person_b_name || 'Person B'}&apos;s Budget
            </label>
            {renderBudgetSuggestion('person_b', setPersonBGoal)}
            <Input
              id="settings-budget-goal-pb"
              type="number"
              min="0"
              step="0.01"
              value={personBGoal}
              onChange={(e) => setPersonBGoal(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <label htmlFor="settings-budget-goal-joint" className="mb-2 block text-sm text-gray-600">
              Joint Budget
            </label>
            {renderBudgetSuggestion('joint', setJointGoal)}
            <Input
              id="settings-budget-goal-joint"
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

      <Modal
        isOpen={modalType === 'category'}
        onClose={closeModal}
        title={editingCategory ? 'Edit Category' : 'Add Category'}
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-[#EF4444]">{error}</div>
          )}

          <Input
            label="Category Name"
            type="text"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="e.g., Groceries"
          />

          <div>
            <label className="mb-2 block text-sm text-gray-600">Icon</label>
            <p className="mb-2 text-xs text-gray-500">
              Choose an emoji. For new categories we pick one from the name until you tap an icon
              below.
            </p>
            <div className="mb-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 p-2">
              {CATEGORY_ICON_OPTIONS.map((emo) => (
                <button
                  key={emo}
                  type="button"
                  onClick={() => {
                    iconUserPickedRef.current = true;
                    setCategoryIcon(emo);
                  }}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-all ${
                    categoryIcon === emo
                      ? 'bg-white shadow ring-2 ring-[#14B8A6]'
                      : 'hover:bg-white'
                  }`}
                >
                  {emo}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={closeModal} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSaveCategory} loading={saving} className="flex-1">
              {editingCategory ? 'Save' : 'Add'}
            </Button>
          </div>

          {editingCategory && (
            <Button
              variant="ghost"
              onClick={() => {
                handleDeleteCategory(editingCategory);
                closeModal();
              }}
              className="w-full text-[#EF4444] hover:bg-red-50"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Category
            </Button>
          )}
        </div>
      </Modal>
    </>
  );
}
