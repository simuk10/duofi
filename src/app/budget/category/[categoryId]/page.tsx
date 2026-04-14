'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { AppLayout } from '@/components/layout';
import { Card } from '@/components/ui';
import { useAuth, useCategories, useTransactions } from '@/hooks';
import { categoryIconToEmoji } from '@/lib/category-icons';
import {
  addCalendarMonths,
  formatCurrency,
  formatDate,
  getBudgetDrilldownOldestMonth,
  clampMonthYearToComplete,
  getLatestCompleteMonthYear,
  getMonthYearDisplay,
} from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { BudgetOwner } from '@/types/database';

const OWNERS: BudgetOwner[] = ['person_a', 'person_b', 'joint'];

function parseOwner(raw: string | null): BudgetOwner | null {
  if (!raw) return null;
  return OWNERS.includes(raw as BudgetOwner) ? (raw as BudgetOwner) : null;
}

function BudgetCategoryContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const categoryId = params.categoryId as string;

  const ownerParam = parseOwner(searchParams.get('owner'));
  const monthParam = searchParams.get('month');
  const latestComplete = getLatestCompleteMonthYear();
  const rawMonth =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : latestComplete;
  const monthYear = clampMonthYearToComplete(rawMonth);
  const budgetOwner = ownerParam ?? 'person_a';

  const { household } = useAuth();
  const { categories, loading: catsLoading } = useCategories({
    householdId: household?.id ?? null,
  });

  const category = useMemo(
    () => categories.find((c) => c.id === categoryId),
    [categories, categoryId]
  );

  const { transactions, loading: txLoading } = useTransactions({
    householdId: household?.id ?? null,
    filter: 'categorized',
    monthYear,
    categoryId,
    budgetOwner,
  });

  const total = useMemo(
    () => transactions.reduce((s, t) => s + t.amount, 0),
    [transactions]
  );

  const oldestMonth = getBudgetDrilldownOldestMonth();
  const canGoPrev = monthYear > oldestMonth;
  const canGoNext = monthYear < latestComplete;

  const ownerLabel =
    budgetOwner === 'person_a'
      ? household?.person_a_name || 'Person A'
      : budgetOwner === 'person_b'
        ? household?.person_b_name || 'Person B'
        : 'Joint';

  const hrefForMonth = (m: string) =>
    `/budget/category/${categoryId}?month=${m}&owner=${budgetOwner}`;

  const loading = catsLoading || txLoading;

  return (
    <>
      <header className="border-b border-gray-200 bg-white px-4 pb-3 pt-3">
        <div className="mb-3 flex items-center gap-2">
          <Link
            href="/budget"
            className="text-sm font-medium text-[#14B8A6] hover:text-[#0D9488]"
          >
            ← Budget
          </Link>
        </div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          {category && (
            <span className="text-2xl leading-none">
              {categoryIconToEmoji(category.icon, category.name)}
            </span>
          )}
          {category?.name ?? 'Category'}
        </h1>
        <p className="text-sm text-gray-500">{ownerLabel}</p>

        <div className="mt-4 flex items-center justify-center gap-2">
          {canGoPrev ? (
            <Link
              href={hrefForMonth(addCalendarMonths(monthYear, -1))}
              className="rounded-lg p-2 text-gray-700 hover:bg-gray-100"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-6 w-6" />
            </Link>
          ) : (
            <span className="rounded-lg p-2 text-gray-300" aria-hidden>
              <ChevronLeft className="h-6 w-6" />
            </span>
          )}
          <span className="min-w-[10rem] text-center text-sm font-semibold text-gray-900">
            {getMonthYearDisplay(monthYear)}
          </span>
          {canGoNext ? (
            <Link
              href={hrefForMonth(addCalendarMonths(monthYear, 1))}
              className="rounded-lg p-2 text-gray-700 hover:bg-gray-100"
              aria-label="Next month"
            >
              <ChevronRight className="h-6 w-6" />
            </Link>
          ) : (
            <span className="rounded-lg p-2 text-gray-300" aria-hidden>
              <ChevronRight className="h-6 w-6" />
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
        {!catsLoading && !category && (
          <p className="text-center text-sm text-gray-500 py-8">
            This category was not found.
          </p>
        )}

        {category && (
          <>
            <div className="mb-4 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Total</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(total)}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {transactions.length} transaction
                {transactions.length !== 1 ? 's' : ''}
              </p>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-8">
                No transactions in this category for {getMonthYearDisplay(monthYear)}.
              </p>
            ) : (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <Card key={tx.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#14B8A6]/20 to-[#0891B2]/20">
                          <span className="text-sm text-[#0891B2]">
                            {tx.description.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[15px] text-gray-900">{tx.description}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {formatDate(tx.date)}
                          </p>
                          <p className="mt-1 text-xs text-gray-400">
                            {tx.credit_card?.name ?? 'Card'} · Paid by{' '}
                            {tx.paid_by === 'person_a'
                              ? household?.person_a_name
                              : tx.paid_by === 'person_b'
                                ? household?.person_b_name
                                : 'Joint'}
                          </p>
                        </div>
                      </div>
                      <p className="shrink-0 text-[15px] text-gray-900">
                        {formatCurrency(tx.amount)}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function DrilldownFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
    </div>
  );
}

export default function BudgetCategoryPage() {
  return (
    <AppLayout>
      <Suspense fallback={<DrilldownFallback />}>
        <BudgetCategoryContent />
      </Suspense>
    </AppLayout>
  );
}
