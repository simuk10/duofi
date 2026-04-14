import type { Transaction } from '@/types/database';
import { buildTransactionInsights } from '@/lib/transaction-insights';
import { getMonthYearDisplay } from '@/lib/utils';

export const INSIGHT_CHART_COLORS = [
  '#14B8A6',
  '#0891B2',
  '#06B6D4',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#10B981',
];

function shortMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(y, m - 1, 1));
}

function sumByMonth(transactions: Transaction[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of transactions) {
    const my = t.date.slice(0, 7);
    m.set(my, (m.get(my) || 0) + Number(t.amount));
  }
  return m;
}

/** Oldest → newest month keys, inclusive. */
export function buildInsightsDashboardModel(
  transactions: Transaction[],
  monthKeysOldestFirst: string[],
  anchorMonth: string,
  options: { personAName: string; personBName: string }
) {
  const { personAName, personBName } = options;
  const byMonth = sumByMonth(transactions);

  const monthlySpending = monthKeysOldestFirst.map((mk) => ({
    month: shortMonthLabel(mk),
    total: Math.round((byMonth.get(mk) || 0) * 100) / 100,
    monthKey: mk,
  }));

  let highest = monthlySpending[0];
  for (const row of monthlySpending) {
    if (row.total > highest.total) highest = row;
  }
  const categorized = transactions.filter((t) => t.is_categorized && t.category_id && t.category);
  const nMonths = monthKeysOldestFirst.length || 1;

  const catTotals = new Map<string, { name: string; total: number }>();
  for (const t of categorized) {
    const id = t.category_id!;
    const name = t.category!.name;
    const cur = catTotals.get(id) || { name, total: 0 };
    cur.total += Number(t.amount);
    catTotals.set(id, cur);
  }

  const categorySpendingAvg = [...catTotals.values()]
    .map((c, idx) => ({
      category: c.name,
      avg: Math.round((c.total / nMonths) * 100) / 100,
      color: INSIGHT_CHART_COLORS[idx % INSIGHT_CHART_COLORS.length],
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 7);

  let topCategory = categorySpendingAvg[0] ?? { category: '—', avg: 0, color: INSIGHT_CHART_COLORS[0] };

  const last6Keys = monthKeysOldestFirst.slice(-6);
  const catTotalsLast6 = new Map<string, { name: string; total: number }>();
  for (const t of categorized) {
    const my = t.date.slice(0, 7);
    if (!last6Keys.includes(my)) continue;
    const id = t.category_id!;
    const name = t.category!.name;
    const cur = catTotalsLast6.get(id) || { name, total: 0 };
    cur.total += Number(t.amount);
    catTotalsLast6.set(id, cur);
  }

  const top4ForTrends = [...catTotalsLast6.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 4)
    .map(([, v]) => v.name);

  const colorByName = new Map<string, string>(
    categorySpendingAvg.map((c) => [c.category, c.color])
  );
  const categoryTrendColors = top4ForTrends.map(
    (name, i) => colorByName.get(name) ?? INSIGHT_CHART_COLORS[i % INSIGHT_CHART_COLORS.length]
  );

  const categoryTrends = last6Keys.map((mk) => {
    const row: Record<string, string | number> = { month: shortMonthLabel(mk) };
    for (const catName of top4ForTrends) {
      let sum = 0;
      for (const t of categorized) {
        if (t.date.slice(0, 7) !== mk) continue;
        if (t.category?.name !== catName) continue;
        sum += Number(t.amount);
      }
      row[catName] = Math.round(sum * 100) / 100;
    }
    return row;
  });

  const vendorMap = new Map<string, { count: number; total: number }>();
  for (const t of transactions) {
    const key = (t.description || '').trim() || 'Unknown';
    const cur = vendorMap.get(key) || { count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(t.amount);
    vendorMap.set(key, cur);
  }

  const topVendors = [...vendorMap.entries()]
    .map(([name, v]) => ({ name, count: v.count, total: Math.round(v.total * 100) / 100 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const tail12 = monthKeysOldestFirst.slice(-12);
  const quarters: { period: string; avgMonthly: number; trend: 'increase' | 'decrease' | 'stable' }[] = [];
  for (let q = 0; q < 4; q++) {
    const slice = tail12.slice(q * 3, q * 3 + 3);
    if (slice.length === 0) continue;
    const total = slice.reduce((sum, mk) => sum + (byMonth.get(mk) || 0), 0);
    const avgMonthly = total / slice.length;
    quarters.push({
      period: `${shortMonthLabel(slice[0])}-${shortMonthLabel(slice[slice.length - 1])}`,
      avgMonthly,
      trend: 'stable',
    });
  }
  for (let i = 1; i < quarters.length; i++) {
    const prev = quarters[i - 1].avgMonthly;
    const curr = quarters[i].avgMonthly;
    if (prev <= 0) continue;
    const pct = ((curr - prev) / prev) * 100;
    if (pct > 3) quarters[i].trend = 'increase';
    else if (pct < -3) quarters[i].trend = 'decrease';
    else quarters[i].trend = 'stable';
  }

  const mk = monthKeysOldestFirst;
  const lastIdx = mk.length - 1;
  const currentMonthSpend = lastIdx >= 0 ? byMonth.get(mk[lastIdx]) || 0 : 0;
  const previousMonthSpend = lastIdx >= 1 ? byMonth.get(mk[lastIdx - 1]) || 0 : 0;
  const monthOverMonthChange =
    previousMonthSpend > 0
      ? ((currentMonthSpend - previousMonthSpend) / previousMonthSpend) * 100
      : null;

  const last6 = mk.slice(-6);
  const prev6 = mk.length >= 12 ? mk.slice(-12, -6) : [];
  const last6Avg =
    last6.length > 0
      ? last6.reduce((s, k) => s + (byMonth.get(k) || 0), 0) / last6.length
      : 0;
  const previousSixMonthsAvg =
    prev6.length > 0
      ? prev6.reduce((s, k) => s + (byMonth.get(k) || 0), 0) / prev6.length
      : 0;
  const sixMonthTrend =
    previousSixMonthsAvg > 0
      ? ((last6Avg - previousSixMonthsAvg) / previousSixMonthsAvg) * 100
      : null;

  const cards = buildTransactionInsights(transactions, {
    anchorMonth,
    personAName,
    personBName,
  });
  const insightBullets = cards.slice(0, 5).map((c) => c.title);
  while (insightBullets.length < 4) {
    insightBullets.push('Import and categorize transactions regularly to sharpen these insights.');
  }

  return {
    monthlySpending,
    categorySpendingAvg,
    categoryTrends,
    categoryTrendSeries: top4ForTrends,
    categoryTrendColors,
    topVendors,
    spendingBehavior: quarters,
    kpis: {
      highestMonth: {
        month: highest.month,
        total: Math.round(highest.total * 100) / 100,
        fullLabel: getMonthYearDisplay(highest.monthKey),
      },
      topCategory,
      monthOverMonthChange,
      sixMonthTrend,
      last6MonthsAvg: Math.round(last6Avg * 100) / 100,
    },
    insightBullets: insightBullets.slice(0, 5),
  };
}

export type InsightsDashboardModel = ReturnType<typeof buildInsightsDashboardModel>;
