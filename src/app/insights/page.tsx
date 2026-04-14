'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui';
import { InsightsDashboard } from '@/components/insights/InsightsDashboard';
import { useAuth, useTransactions } from '@/hooks';
import { buildInsightsDashboardModel } from '@/lib/insights-dashboard';
import { getChartMonthWindow, getLatestCompleteMonthYear } from '@/lib/utils';
import { Upload } from 'lucide-react';

export type InsightRangePreset = 1 | 3 | 6 | 9 | 12;
export type InsightOwnerFilter = 'personal' | 'joint' | 'total';
export type InsightSelectedPerson = 'A' | 'B';

function monthKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  const [sy, sm] = from.split('-').map(Number);
  const [ey, em] = to.split('-').map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return keys;
}

export default function InsightsPage() {
  const [rangePreset, setRangePreset] = useState<InsightRangePreset | 'custom'>(12);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<InsightOwnerFilter>('total');
  const [selectedPerson, setSelectedPerson] = useState<InsightSelectedPerson>('A');

  const anchorMonth = getLatestCompleteMonthYear();

  const isCustom = rangePreset === 'custom' && customFrom && customTo;

  const { keys, dateFrom, dateTo } = useMemo(() => {
    if (isCustom) {
      const fromMonth = customFrom.slice(0, 7);
      const toMonth = customTo.slice(0, 7);
      const keys = monthKeysBetween(fromMonth, toMonth);
      return { keys, dateFrom: customFrom, dateTo: customTo };
    }
    return getChartMonthWindow(0, rangePreset === 'custom' ? 12 : rangePreset);
  }, [rangePreset, customFrom, customTo, isCustom]);

  const { household } = useAuth();
  const { transactions, loading } = useTransactions({
    householdId: household?.id ?? null,
    filter: 'all',
    dateFrom,
    dateTo,
  });

  const filteredTransactions = useMemo(() => {
    const personalOwner = selectedPerson === 'A' ? 'person_a' : 'person_b';
    if (ownerFilter === 'personal') {
      return transactions.filter((t) => t.budget_owner === personalOwner);
    }
    if (ownerFilter === 'joint') {
      return transactions.filter((t) => t.budget_owner === 'joint');
    }
    return transactions.filter(
      (t) => t.budget_owner === personalOwner || t.budget_owner === 'joint'
    );
  }, [transactions, ownerFilter, selectedPerson]);

  const model = useMemo(
    () =>
      buildInsightsDashboardModel(filteredTransactions, keys, anchorMonth, {
        personAName: household?.person_a_name ?? 'Person A',
        personBName: household?.person_b_name ?? 'Person B',
      }),
    [filteredTransactions, keys, anchorMonth, household?.person_a_name, household?.person_b_name]
  );

  const rangeLabel = (() => {
    if (rangePreset === 'custom' && customFrom && customTo)
      return `${customFrom} – ${customTo}`;
    if (rangePreset === 'custom') return 'Custom';
    return `Last ${rangePreset} ${rangePreset === 1 ? 'Month' : 'Months'}`;
  })();

  return (
    <AppLayout>
      {loading ? (
        <div className="flex min-h-[50vh] items-center justify-center bg-[#F9FAFB]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="bg-[#F9FAFB] px-4 pb-24 pt-8">
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-600">
              No transactions in this range yet. Import a CSV to unlock insights.
            </p>
            <Link href="/dashboard/upload">
              <Button className="mt-4">
                <Upload className="mr-2 h-4 w-4" />
                Upload transactions
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <InsightsDashboard
          model={model}
          rangePreset={rangePreset}
          rangeLabel={rangeLabel}
          onRangePresetChange={setRangePreset}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
          ownerFilter={ownerFilter}
          onOwnerFilterChange={setOwnerFilter}
          selectedPerson={selectedPerson}
          onSelectedPersonChange={setSelectedPerson}
          personALabel={household?.person_a_name ?? 'Person A'}
          personBLabel={household?.person_b_name ?? 'Person B'}
        />
      )}
    </AppLayout>
  );
}
