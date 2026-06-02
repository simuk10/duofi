import { budgetOwnersForInsightFilter } from '@/lib/insights-aggregates';
import type { BudgetOwner } from '@/types/database';
import type { Transaction } from '@/types/database';

export type InsightsOwnerFilterParam = 'personal' | 'joint' | 'total';
export type InsightsPersonParam = 'A' | 'B';

/** Same key as insights top-vendors aggregation (TRIM(description)). */
export function vendorDescriptionKey(description: string): string {
  return (description || '').trim() || 'Unknown';
}

export function parseInsightsOwnerParams(
  owner: string | null,
  person: string | null
): BudgetOwner[] | null {
  if (owner !== 'personal' && owner !== 'joint' && owner !== 'total') {
    return null;
  }
  const selectedPerson: InsightsPersonParam = person === 'B' ? 'B' : 'A';
  return budgetOwnersForInsightFilter(owner, selectedPerson);
}

export function transactionMatchesVendorDrilldown(
  t: Transaction,
  vendorKey: string,
  options: {
    dateFrom: string;
    dateTo: string;
    budgetOwners?: BudgetOwner[] | null;
  }
): boolean {
  if (vendorDescriptionKey(t.description) !== vendorKey) return false;
  if (t.date < options.dateFrom || t.date > options.dateTo) return false;
  if (options.budgetOwners?.length) {
    if (!t.budget_owner || !options.budgetOwners.includes(t.budget_owner)) {
      return false;
    }
  }
  return true;
}

export function buildInsightsVendorTransactionsUrl(params: {
  vendor: string;
  dateFrom: string;
  dateTo: string;
  ownerFilter: InsightsOwnerFilterParam;
  selectedPerson: InsightsPersonParam;
}): string {
  const sp = new URLSearchParams();
  sp.set('vendor', params.vendor);
  sp.set('from', params.dateFrom);
  sp.set('to', params.dateTo);
  sp.set('month', 'all');
  sp.set('filter', 'all');
  sp.set('insightsOwner', params.ownerFilter);
  sp.set('insightsPerson', params.selectedPerson);
  return `/transactions?${sp.toString()}`;
}
