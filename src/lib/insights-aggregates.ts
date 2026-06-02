import type { BudgetOwner } from '@/types/database';
import { addCalendarMonths, formatCurrency, getMonthYearDisplay } from '@/lib/utils';

export const INSIGHT_CHART_COLORS = [
  '#14B8A6',
  '#0891B2',
  '#06B6D4',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#10B981',
];

export interface MonthlyTotalRow {
  month: string;
  total: number;
}

export interface CategoryTotalRow {
  category_id: string;
  category_name: string;
  total: number;
}

export interface CategoryByMonthRow {
  month: string;
  category_id: string;
  category_name: string;
  total: number;
}

export interface TopVendorRow {
  description: string;
  count: number;
  total: number;
}

export interface BiggestTxRow {
  id: string;
  amount: number;
  description: string;
  date: string;
  category_id: string | null;
  category_name: string | null;
  is_categorized: boolean;
}

export interface CategoryMomRow {
  category_id: string;
  category_name: string;
  this_amount: number;
  prev_amount: number;
}

export interface TopCategoryShare {
  category_id: string;
  category_name: string;
  total: number;
  month_categorized_total: number;
}

export interface AnchorStats {
  anchor_month: string;
  prev_month: string;
  this_total: number;
  last_total: number;
  uncategorized_count: number;
  uncategorized_amount: number;
  month_total: number;
  joint_amount: number;
  personal_amount: number;
  person_a_amount: number;
  person_b_amount: number;
  category_mom: CategoryMomRow[];
  monthly_totals_6mo: MonthlyTotalRow[];
  top_category_share: TopCategoryShare | null;
}

export interface InsightsAggregates {
  monthly_totals: MonthlyTotalRow[];
  category_totals: CategoryTotalRow[];
  category_by_month: CategoryByMonthRow[];
  top_vendors: TopVendorRow[];
  biggest_tx: BiggestTxRow | null;
  anchor_stats: AnchorStats | null;
}

export interface SlimInsightRow {
  id: string;
  date: string;
  amount: number;
  description: string;
  is_categorized: boolean;
  category_id: string | null;
  budget_owner: BudgetOwner | null;
  category?: { name: string } | null;
}

function shortMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(y, m - 1, 1));
}

function pctChange(prev: number, curr: number): number | null {
  if (prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

function monthSeriesChrono(anchorMonth: string, len: number): string[] {
  const out: string[] = [];
  for (let back = len - 1; back >= 0; back--) {
    out.push(addCalendarMonths(anchorMonth, -back));
  }
  return out;
}

function totalsMap(rows: MonthlyTotalRow[]): Map<string, number> {
  return new Map(rows.map((r) => [r.month, Number(r.total)]));
}

function categorySeriesFromByMonth(
  rows: CategoryByMonthRow[],
  categoryId: string,
  monthKeys: string[]
): number[] {
  const sums = new Map<string, number>();
  monthKeys.forEach((k) => sums.set(k, 0));
  for (const r of rows) {
    if (r.category_id !== categoryId) continue;
    if (!sums.has(r.month)) continue;
    sums.set(r.month, (sums.get(r.month) || 0) + Number(r.total));
  }
  return monthKeys.map((k) => sums.get(k) || 0);
}

export function parseInsightsAggregates(raw: unknown): InsightsAggregates {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const anchor = o.anchor_stats as Record<string, unknown> | null | undefined;
  return {
    monthly_totals: (o.monthly_totals as MonthlyTotalRow[]) ?? [],
    category_totals: (o.category_totals as CategoryTotalRow[]) ?? [],
    category_by_month: (o.category_by_month as CategoryByMonthRow[]) ?? [],
    top_vendors: (o.top_vendors as TopVendorRow[]) ?? [],
    biggest_tx: (o.biggest_tx as BiggestTxRow | null) ?? null,
    anchor_stats: anchor
      ? {
          anchor_month: String(anchor.anchor_month ?? ''),
          prev_month: String(anchor.prev_month ?? ''),
          this_total: Number(anchor.this_total ?? 0),
          last_total: Number(anchor.last_total ?? 0),
          uncategorized_count: Number(anchor.uncategorized_count ?? 0),
          uncategorized_amount: Number(anchor.uncategorized_amount ?? 0),
          month_total: Number(anchor.month_total ?? 0),
          joint_amount: Number(anchor.joint_amount ?? 0),
          personal_amount: Number(anchor.personal_amount ?? 0),
          person_a_amount: Number(anchor.person_a_amount ?? 0),
          person_b_amount: Number(anchor.person_b_amount ?? 0),
          category_mom: (anchor.category_mom as CategoryMomRow[]) ?? [],
          monthly_totals_6mo: (anchor.monthly_totals_6mo as MonthlyTotalRow[]) ?? [],
          top_category_share: (anchor.top_category_share as TopCategoryShare | null) ?? null,
        }
      : null,
  };
}

/** Client-side fallback when the RPC migration has not been applied yet. */
export function computeInsightsAggregatesFromRows(
  rows: SlimInsightRow[],
  anchorMonth: string
): InsightsAggregates {
  const prevMonth = addCalendarMonths(anchorMonth, -1);
  const months6 = monthSeriesChrono(anchorMonth, 6);
  const windowStart = `${addCalendarMonths(anchorMonth, -5)}-01`;

  const monthlyMap = new Map<string, number>();
  const categoryTotals = new Map<string, { category_name: string; total: number }>();
  const categoryByMonth = new Map<string, Map<string, { category_id: string; category_name: string; total: number }>>();
  const vendorMap = new Map<string, { count: number; total: number }>();
  const anchorRows = rows.filter((r) => r.date.slice(0, 7) === anchorMonth);
  const prevRows = rows.filter((r) => r.date.slice(0, 7) === prevMonth);

  let biggest: SlimInsightRow | null = null;

  for (const t of rows) {
    const mk = t.date.slice(0, 7);
    monthlyMap.set(mk, (monthlyMap.get(mk) || 0) + Number(t.amount));

    const vendorKey = (t.description || '').trim() || 'Unknown';
    const v = vendorMap.get(vendorKey) || { count: 0, total: 0 };
    v.count += 1;
    v.total += Number(t.amount);
    vendorMap.set(vendorKey, v);

    if (t.date >= windowStart && (!biggest || Number(t.amount) > Number(biggest.amount))) {
      biggest = t;
    }

    if (!t.is_categorized || !t.category_id || !t.category?.name) continue;

    const catId = t.category_id;
    const catName = t.category.name;
    const ct = categoryTotals.get(catId) || { category_name: catName, total: 0 };
    ct.total += Number(t.amount);
    categoryTotals.set(catId, ct);

    let monthMap = categoryByMonth.get(mk);
    if (!monthMap) {
      monthMap = new Map();
      categoryByMonth.set(mk, monthMap);
    }
    const cur = monthMap.get(catId) || { category_id: catId, category_name: catName, total: 0 };
    cur.total += Number(t.amount);
    monthMap.set(catId, cur);
  }

  const categoryMom: CategoryMomRow[] = [];
  const thisByCat = new Map<string, { name: string; total: number }>();
  for (const t of anchorRows) {
    if (!t.is_categorized || !t.category_id || !t.category?.name) continue;
    const cur = thisByCat.get(t.category_id) || { name: t.category.name, total: 0 };
    cur.total += Number(t.amount);
    thisByCat.set(t.category_id, cur);
  }
  const prevByCat = new Map<string, number>();
  for (const t of prevRows) {
    if (!t.is_categorized || !t.category_id) continue;
    prevByCat.set(t.category_id, (prevByCat.get(t.category_id) || 0) + Number(t.amount));
  }
  for (const [category_id, cur] of thisByCat) {
    categoryMom.push({
      category_id,
      category_name: cur.name,
      this_amount: cur.total,
      prev_amount: prevByCat.get(category_id) || 0,
    });
  }

  const monthly_totals_6mo = months6.map((month) => ({
    month,
    total: Math.round((monthlyMap.get(month) || 0) * 100) / 100,
  }));

  const uncategorized = anchorRows.filter((t) => !t.is_categorized);
  const joint_amount = anchorRows
    .filter((t) => t.budget_owner === 'joint')
    .reduce((s, t) => s + Number(t.amount), 0);
  const person_a_amount = anchorRows
    .filter((t) => t.budget_owner === 'person_a')
    .reduce((s, t) => s + Number(t.amount), 0);
  const person_b_amount = anchorRows
    .filter((t) => t.budget_owner === 'person_b')
    .reduce((s, t) => s + Number(t.amount), 0);
  const personal_amount = person_a_amount + person_b_amount;

  let topCat: TopCategoryShare | null = null;
  let topTotal = 0;
  let monthCatTotal = 0;
  for (const t of anchorRows) {
    if (!t.is_categorized || !t.category_id || !t.category?.name) continue;
    monthCatTotal += Number(t.amount);
    const cur = thisByCat.get(t.category_id);
    if (cur && cur.total > topTotal) {
      topTotal = cur.total;
      topCat = {
        category_id: t.category_id,
        category_name: cur.name,
        total: cur.total,
        month_categorized_total: 0,
      };
    }
  }
  if (topCat) topCat.month_categorized_total = monthCatTotal;

  const category_by_month: CategoryByMonthRow[] = [];
  for (const [month, monthMap] of categoryByMonth) {
    for (const row of monthMap.values()) {
      category_by_month.push({ month, ...row });
    }
  }

  return {
    monthly_totals: [...monthlyMap.entries()]
      .map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    category_totals: [...categoryTotals.entries()]
      .map(([category_id, v]) => ({
        category_id,
        category_name: v.category_name,
        total: Math.round(v.total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total),
    category_by_month,
    top_vendors: [...vendorMap.entries()]
      .map(([description, v]) => ({
        description,
        count: v.count,
        total: Math.round(v.total * 100) / 100,
      }))
      .sort((a, b) => b.count - a.count || b.total - a.total)
      .slice(0, 6),
    biggest_tx: biggest
      ? {
          id: biggest.id,
          amount: Number(biggest.amount),
          description: biggest.description,
          date: biggest.date,
          category_id: biggest.category_id,
          category_name: biggest.category?.name ?? null,
          is_categorized: biggest.is_categorized,
        }
      : null,
    anchor_stats: {
      anchor_month: anchorMonth,
      prev_month: prevMonth,
      this_total: anchorRows.reduce((s, t) => s + Number(t.amount), 0),
      last_total: prevRows.reduce((s, t) => s + Number(t.amount), 0),
      uncategorized_count: uncategorized.length,
      uncategorized_amount: uncategorized.reduce((s, t) => s + Number(t.amount), 0),
      month_total: anchorRows.reduce((s, t) => s + Number(t.amount), 0),
      joint_amount,
      personal_amount,
      person_a_amount,
      person_b_amount,
      category_mom: categoryMom,
      monthly_totals_6mo,
      top_category_share: topCat,
    },
  };
}

function buildInsightBullets(
  aggregates: InsightsAggregates,
  anchorMonth: string,
  personAName: string,
  personBName: string
): string[] {
  const stats = aggregates.anchor_stats;
  if (!stats) return [];

  const months6 = monthSeriesChrono(anchorMonth, 6);
  const totals6 = stats.monthly_totals_6mo.length
    ? stats.monthly_totals_6mo.map((r) => Number(r.total))
    : months6.map((m) => {
        const hit = aggregates.monthly_totals.find((r) => r.month === m);
        return hit ? Number(hit.total) : 0;
      });

  const bullets: string[] = [];
  const { this_total, last_total } = stats;
  const pctMom = pctChange(last_total, this_total);

  if (last_total <= 0 && this_total <= 0) {
    bullets.push('No spending recorded this month yet');
  } else if (last_total <= 0 && this_total > 0) {
    bullets.push(`You've spent ${formatCurrency(this_total)} so far this month`);
  } else if (pctMom == null) {
    bullets.push(`Total spending: ${formatCurrency(this_total)} this month`);
  } else if (pctMom >= 0) {
    bullets.push(`Total spending up ${Math.round(pctMom)}% vs last month`);
  } else {
    bullets.push(`Total spending down ${Math.round(-pctMom)}% vs last month`);
  }

  const MIN_BASE = 40;
  let bestGrow: CategoryMomRow | null = null;
  let bestShrink: CategoryMomRow | null = null;
  for (const row of stats.category_mom) {
    if (row.prev_amount < MIN_BASE && row.this_amount < MIN_BASE) continue;
    const pct = pctChange(row.prev_amount, row.this_amount);
    if (pct == null || !Number.isFinite(pct)) continue;
    if (pct > 0 && (!bestGrow || pct > pctChange(bestGrow.prev_amount, bestGrow.this_amount)!)) {
      bestGrow = row;
    }
    if (
      pct < 0 &&
      row.prev_amount >= MIN_BASE &&
      (!bestShrink || pct < pctChange(bestShrink.prev_amount, bestShrink.this_amount)!)
    ) {
      bestShrink = row;
    }
  }

  if (bestGrow) {
    const pct = pctChange(bestGrow.prev_amount, bestGrow.this_amount)!;
    if (pct >= 5) {
      bullets.push(`${bestGrow.category_name} spending up ${Math.round(pct)}% vs last month`);
    }
  }
  if (bestShrink) {
    const pct = pctChange(bestShrink.prev_amount, bestShrink.this_amount)!;
    if (pct <= -5) {
      bullets.push(`${bestShrink.category_name} spending down ${Math.round(-pct)}% vs last month`);
    }
  }

  const biggest = aggregates.biggest_tx;
  if (biggest && Number(biggest.amount) > 0) {
    bullets.push(`Largest purchase: ${formatCurrency(biggest.amount)}`);
  }

  if (
    stats.uncategorized_count > 0 &&
    stats.month_total > 0 &&
    (stats.uncategorized_amount / stats.month_total) * 100 >= 8
  ) {
    bullets.push(
      `${Math.round((stats.uncategorized_amount / stats.month_total) * 100)}% of this month is still uncategorized`
    );
  }

  const denom = stats.joint_amount + stats.personal_amount;
  if (denom > 100 && stats.joint_amount / denom >= 0.55) {
    bullets.push('Joint spending dominates this month');
  }

  const pa = stats.person_a_amount;
  const pb = stats.person_b_amount;
  if (pa > 80 && pb > 80 && Math.abs(pa - pb) / Math.max(pa, pb) >= 0.35) {
    const higher = pa > pb ? personAName : personBName;
    bullets.push(`${higher}'s personal slice is much higher this month`);
  }

  let upStreak = 0;
  for (let i = totals6.length - 1; i > 0; i--) {
    if (totals6[i] > totals6[i - 1]) upStreak++;
    else break;
  }
  if (upStreak >= 3) {
    bullets.push('Total spend has climbed three months in a row');
  }

  const topShare = stats.top_category_share;
  if (
    topShare &&
    topShare.month_categorized_total > 0 &&
    topShare.total / topShare.month_categorized_total >= 0.28
  ) {
    bullets.push(`${topShare.category_name} is a large share of spending`);
  }

  while (bullets.length < 4) {
    bullets.push('Import and categorize transactions regularly to sharpen these insights.');
  }

  return bullets.slice(0, 5);
}

export function buildInsightsDashboardFromAggregates(
  aggregates: InsightsAggregates,
  monthKeysOldestFirst: string[],
  anchorMonth: string,
  options: { personAName: string; personBName: string }
) {
  const { personAName, personBName } = options;
  const byMonth = totalsMap(aggregates.monthly_totals);
  const nMonths = monthKeysOldestFirst.length || 1;

  const monthlySpending = monthKeysOldestFirst.map((mk) => ({
    month: shortMonthLabel(mk),
    total: Math.round((byMonth.get(mk) || 0) * 100) / 100,
    monthKey: mk,
  }));

  let highest = monthlySpending[0] ?? { month: '—', total: 0, monthKey: monthKeysOldestFirst[0] ?? '' };
  for (const row of monthlySpending) {
    if (row.total > highest.total) highest = row;
  }

  const categorySpendingAvg = aggregates.category_totals
    .map((c, idx) => ({
      category: c.category_name,
      avg: Math.round((Number(c.total) / nMonths) * 100) / 100,
      color: INSIGHT_CHART_COLORS[idx % INSIGHT_CHART_COLORS.length],
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 7);

  const topCategory = categorySpendingAvg[0] ?? {
    category: '—',
    avg: 0,
    color: INSIGHT_CHART_COLORS[0],
  };

  const last6Keys = monthKeysOldestFirst.slice(-6);
  const last6KeySet = new Set(last6Keys);
  const catTotalsLast6 = new Map<string, number>();
  for (const row of aggregates.category_by_month) {
    if (!last6KeySet.has(row.month)) continue;
    catTotalsLast6.set(row.category_name, (catTotalsLast6.get(row.category_name) || 0) + Number(row.total));
  }

  const top4ForTrends = [...catTotalsLast6.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => name);

  const colorByName = new Map(categorySpendingAvg.map((c) => [c.category, c.color]));
  const categoryTrendColors = top4ForTrends.map(
    (name, i) => colorByName.get(name) ?? INSIGHT_CHART_COLORS[i % INSIGHT_CHART_COLORS.length]
  );

  const spendByMonthAndCategory = new Map<string, Map<string, number>>();
  for (const row of aggregates.category_by_month) {
    if (!last6KeySet.has(row.month)) continue;
    let monthMap = spendByMonthAndCategory.get(row.month);
    if (!monthMap) {
      monthMap = new Map();
      spendByMonthAndCategory.set(row.month, monthMap);
    }
    monthMap.set(row.category_name, (monthMap.get(row.category_name) || 0) + Number(row.total));
  }

  const categoryTrends = last6Keys.map((mk) => {
    const row: Record<string, string | number> = { month: shortMonthLabel(mk) };
    const monthMap = spendByMonthAndCategory.get(mk);
    for (const catName of top4ForTrends) {
      row[catName] = Math.round((monthMap?.get(catName) || 0) * 100) / 100;
    }
    return row;
  });

  const topVendors = aggregates.top_vendors.map((v) => ({
    name: v.description,
    count: v.count,
    total: Number(v.total),
  }));

  const tail12 = monthKeysOldestFirst.slice(-12);
  const quarters: { period: string; avgMonthly: number; trend: 'increase' | 'decrease' | 'stable' }[] = [];
  for (let q = 0; q < 4; q++) {
    const slice = tail12.slice(q * 3, q * 3 + 3);
    if (slice.length === 0) continue;
    const total = slice.reduce((sum, mk) => sum + (byMonth.get(mk) || 0), 0);
    quarters.push({
      period: `${shortMonthLabel(slice[0])}-${shortMonthLabel(slice[slice.length - 1])}`,
      avgMonthly: total / slice.length,
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
    last6.length > 0 ? last6.reduce((s, k) => s + (byMonth.get(k) || 0), 0) / last6.length : 0;
  const previousSixMonthsAvg =
    prev6.length > 0 ? prev6.reduce((s, k) => s + (byMonth.get(k) || 0), 0) / prev6.length : 0;
  const sixMonthTrend =
    previousSixMonthsAvg > 0
      ? ((last6Avg - previousSixMonthsAvg) / previousSixMonthsAvg) * 100
      : null;

  const insightBullets = buildInsightBullets(aggregates, anchorMonth, personAName, personBName);

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
    insightBullets,
  };
}

export type InsightsDashboardModel = ReturnType<typeof buildInsightsDashboardFromAggregates>;

export function budgetOwnersForInsightFilter(
  ownerFilter: 'personal' | 'joint' | 'total',
  selectedPerson: 'A' | 'B'
): BudgetOwner[] {
  const personalOwner = selectedPerson === 'A' ? 'person_a' : 'person_b';
  if (ownerFilter === 'personal') return [personalOwner];
  if (ownerFilter === 'joint') return ['joint'];
  return [personalOwner, 'joint'];
}
