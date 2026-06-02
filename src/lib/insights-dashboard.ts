import type { Transaction } from '@/types/database';
import {
  buildInsightsDashboardFromAggregates,
  computeInsightsAggregatesFromRows,
  type InsightsDashboardModel,
} from '@/lib/insights-aggregates';

export {
  INSIGHT_CHART_COLORS,
  buildInsightsDashboardFromAggregates,
  budgetOwnersForInsightFilter,
  type InsightsDashboardModel,
} from '@/lib/insights-aggregates';

/** Builds the dashboard from full transaction rows (client-side aggregation). */
export function buildInsightsDashboardModel(
  transactions: Transaction[],
  monthKeysOldestFirst: string[],
  anchorMonth: string,
  options: { personAName: string; personBName: string }
): InsightsDashboardModel {
  const slim = transactions.map((t) => ({
    id: t.id,
    date: t.date,
    amount: Number(t.amount),
    description: t.description,
    is_categorized: t.is_categorized,
    category_id: t.category_id,
    budget_owner: t.budget_owner,
    category: t.category ? { name: t.category.name } : null,
  }));
  const aggregates = computeInsightsAggregatesFromRows(slim, anchorMonth);
  return buildInsightsDashboardFromAggregates(
    aggregates,
    monthKeysOldestFirst,
    anchorMonth,
    options
  );
}
