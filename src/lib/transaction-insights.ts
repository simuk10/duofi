import type { Transaction } from '@/types/database';
import {
  addCalendarMonths,
  formatCurrency,
  formatDate,
  getMonthYearDisplay,
} from '@/lib/utils';

export interface InsightFeedCard {
  id: string;
  title: string;
  explanation: string;
  /** Oldest → newest (for sparkline). */
  sparklineValues: number[];
  ctaLabel: string;
  ctaHref: string;
}

/** `anchorMonth` YYYY-MM — latest fully completed calendar month for reporting. */
export function buildTransactionInsights(
  transactions: Transaction[],
  options: {
    anchorMonth: string;
    personAName: string;
    personBName: string;
  }
): InsightFeedCard[] {
  const { anchorMonth, personAName, personBName } = options;
  const prevMonth = addCalendarMonths(anchorMonth, -1);

  const months6 = monthSeriesChrono(anchorMonth, 6);
  const totals6 = sumByMonthKeys(transactions, months6);

  const byMonthTotal = new Map<string, number>();
  for (const t of transactions) {
    const my = t.date.slice(0, 7);
    byMonthTotal.set(my, (byMonthTotal.get(my) || 0) + Number(t.amount));
  }

  const thisTotal = byMonthTotal.get(anchorMonth) || 0;
  const lastTotal = byMonthTotal.get(prevMonth) || 0;
  const pctMom = pctChange(lastTotal, thisTotal);

  const cards: InsightFeedCard[] = [];

  // 1) MoM total spend
  let momTitle: string;
  if (lastTotal <= 0 && thisTotal <= 0) {
    momTitle = 'No spending recorded this month yet';
  } else if (lastTotal <= 0 && thisTotal > 0) {
    momTitle = `You’ve spent ${formatCurrency(thisTotal)} so far this month`;
  } else if (pctMom == null) {
    momTitle = `Total spending: ${formatCurrency(thisTotal)} this month`;
  } else if (pctMom >= 0) {
    momTitle = `Total spending up ${Math.round(pctMom)}% vs last month`;
  } else {
    momTitle = `Total spending down ${Math.round(-pctMom)}% vs last month`;
  }

  const momExplanation =
    lastTotal > 0
      ? `${getMonthYearDisplay(anchorMonth)} is at ${formatCurrency(thisTotal)} so far, compared with ${formatCurrency(lastTotal)} in ${getMonthYearDisplay(prevMonth)}.`
      : thisTotal > 0
        ? `Your household has logged ${formatCurrency(thisTotal)} in ${getMonthYearDisplay(anchorMonth)}.`
        : 'Import or categorize transactions to see month-over-month trends.';

  cards.push({
    id: 'insight-mom-total',
    title: momTitle,
    explanation: momExplanation,
    sparklineValues: totals6,
    ctaLabel: 'View transactions',
    ctaHref: `/transactions?month=${encodeURIComponent(anchorMonth)}&filter=all`,
  });

  const catTx = transactions.filter((t) => t.is_categorized && t.category_id && t.category);

  // 2) Top growing category (this vs prev month)
  const thisByCat = sumByCategoryMonth(catTx, anchorMonth);
  const prevByCat = sumByCategoryMonth(catTx, prevMonth);

  let bestGrow: {
    id: string;
    name: string;
    pct: number;
    thisAmt: number;
    prevAmt: number;
  } | null = null;
  let bestShrink: {
    id: string;
    name: string;
    pct: number;
    thisAmt: number;
    prevAmt: number;
  } | null = null;

  const MIN_BASE = 40;

  for (const [id, cur] of thisByCat) {
    const prevAmt = prevByCat.get(id)?.total ?? 0;
    const thisAmt = cur.total;
    if (prevAmt < MIN_BASE && thisAmt < MIN_BASE) continue;
    const pct = pctChange(prevAmt, thisAmt);
    if (pct == null || !Number.isFinite(pct)) continue;
    if (pct > 0 && (!bestGrow || pct > bestGrow.pct)) {
      bestGrow = { id, name: cur.name, pct, thisAmt, prevAmt };
    }
    if (pct < 0 && prevAmt >= MIN_BASE && (!bestShrink || pct < bestShrink.pct)) {
      bestShrink = { id, name: cur.name, pct, thisAmt, prevAmt };
    }
  }

  if (bestGrow && bestGrow.pct >= 5) {
    const series = categorySeries(catTx, bestGrow.id, months6);
    cards.push({
      id: `insight-grow-${bestGrow.id}`,
      title: `${bestGrow.name} spending up ${Math.round(bestGrow.pct)}% vs last month`,
      explanation: `You spent ${formatCurrency(bestGrow.thisAmt)} on ${bestGrow.name} in ${getMonthYearDisplay(anchorMonth)}, up from ${formatCurrency(bestGrow.prevAmt)} in ${getMonthYearDisplay(prevMonth)}.`,
      sparklineValues: series,
      ctaLabel: 'View transactions',
      ctaHref: `/transactions?month=${encodeURIComponent(anchorMonth)}&filter=categorized&category=${encodeURIComponent(bestGrow.id)}`,
    });
  }

  if (bestShrink && bestShrink.pct <= -5) {
    const series = categorySeries(catTx, bestShrink.id, months6);
    cards.push({
      id: `insight-shrink-${bestShrink.id}`,
      title: `${bestShrink.name} spending down ${Math.round(-bestShrink.pct)}% vs last month`,
      explanation: `${bestShrink.name} came in at ${formatCurrency(bestShrink.thisAmt)} this month versus ${formatCurrency(bestShrink.prevAmt)} last month.`,
      sparklineValues: series,
      ctaLabel: 'View transactions',
      ctaHref: `/transactions?month=${encodeURIComponent(anchorMonth)}&filter=categorized&category=${encodeURIComponent(bestShrink.id)}`,
    });
  }

  // 4) Biggest single-transaction spike (recent window)
  const windowStart = `${addCalendarMonths(anchorMonth, -5)}-01`;
  const windowEnd = new Date().toISOString().split('T')[0];
  let biggest: Transaction | null = null;
  for (const t of transactions) {
    if (t.date < windowStart || t.date > windowEnd) continue;
    if (!biggest || Number(t.amount) > Number(biggest.amount)) biggest = t;
  }

  if (biggest && Number(biggest.amount) > 0) {
    const my = biggest.date.slice(0, 7);
    const catName = biggest.category?.name || 'Spending';
    const series =
      biggest.category_id && biggest.is_categorized
        ? categorySeries(catTx, biggest.category_id, months6)
        : totals6;
    cards.push({
      id: `insight-spike-${biggest.id}`,
      title: `Largest purchase: ${formatCurrency(biggest.amount)}`,
      explanation: `${biggest.description.slice(0, 60)}${biggest.description.length > 60 ? '…' : ''} on ${formatDate(biggest.date)}${biggest.category ? ` · ${biggest.category.name}` : ''}.`,
      sparklineValues: series,
      ctaLabel: 'View transactions',
      ctaHref: biggest.category_id
        ? `/transactions?month=${encodeURIComponent(my)}&filter=categorized&category=${encodeURIComponent(biggest.category_id)}`
        : `/transactions?month=${encodeURIComponent(my)}&filter=all`,
    });
  }

  // 5) Three personalized tips
  cards.push(...buildTips(transactions, anchorMonth, personAName, personBName, months6, totals6));

  return cards;
}

function monthSeriesChrono(anchorMonth: string, len: number): string[] {
  const out: string[] = [];
  for (let back = len - 1; back >= 0; back--) {
    out.push(addCalendarMonths(anchorMonth, -back));
  }
  return out;
}

function sumByMonthKeys(txs: Transaction[], keys: string[]): number[] {
  const sums = new Map<string, number>();
  keys.forEach((k) => sums.set(k, 0));
  for (const t of txs) {
    const my = t.date.slice(0, 7);
    if (!sums.has(my)) continue;
    sums.set(my, (sums.get(my) || 0) + Number(t.amount));
  }
  return keys.map((k) => sums.get(k) || 0);
}

function pctChange(prev: number, curr: number): number | null {
  if (prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

function sumByCategoryMonth(
  txs: Transaction[],
  monthYear: string
): Map<string, { name: string; total: number }> {
  const m = new Map<string, { name: string; total: number }>();
  for (const t of txs) {
    if (t.date.slice(0, 7) !== monthYear) continue;
    const id = t.category_id!;
    const name = t.category!.name;
    const cur = m.get(id) || { name, total: 0 };
    cur.total += Number(t.amount);
    m.set(id, cur);
  }
  return m;
}

function categorySeries(
  txs: Transaction[],
  categoryId: string,
  monthKeys: string[]
): number[] {
  const sums = new Map<string, number>();
  monthKeys.forEach((k) => sums.set(k, 0));
  for (const t of txs) {
    if (t.category_id !== categoryId) continue;
    const my = t.date.slice(0, 7);
    if (!sums.has(my)) continue;
    sums.set(my, (sums.get(my) || 0) + Number(t.amount));
  }
  return monthKeys.map((k) => sums.get(k) || 0);
}

function buildTips(
  transactions: Transaction[],
  anchorMonth: string,
  personAName: string,
  personBName: string,
  months6: string[],
  totals6: number[]
): InsightFeedCard[] {
  const tips: InsightFeedCard[] = [];

  const uncategorized = transactions.filter(
    (t) => !t.is_categorized && t.date.slice(0, 7) === anchorMonth
  );
  const catMonthTotal = transactions
    .filter((t) => t.date.slice(0, 7) === anchorMonth)
    .reduce((s, t) => s + Number(t.amount), 0);

  if (uncategorized.length > 0 && catMonthTotal > 0) {
    const pct = (uncategorized.reduce((s, t) => s + Number(t.amount), 0) / catMonthTotal) * 100;
    if (pct >= 8) {
      tips.push({
        id: 'tip-uncategorized',
        title: `${Math.round(pct)}% of this month is still uncategorized`,
        explanation: `Cleaning up ${uncategorized.length} transaction${uncategorized.length === 1 ? '' : 's'} would sharpen your budgets and insights.`,
        sparklineValues: totals6,
        ctaLabel: 'Review uncategorized',
        ctaHref: `/transactions?month=${encodeURIComponent(anchorMonth)}&filter=uncategorized`,
      });
    }
  }

  const jointMonth = transactions
    .filter((t) => t.budget_owner === 'joint' && t.date.slice(0, 7) === anchorMonth)
    .reduce((s, t) => s + Number(t.amount), 0);
  const personalMonth = transactions
    .filter(
      (t) =>
        (t.budget_owner === 'person_a' || t.budget_owner === 'person_b') &&
        t.date.slice(0, 7) === anchorMonth
    )
    .reduce((s, t) => s + Number(t.amount), 0);
  const denom = jointMonth + personalMonth;
  if (denom > 100 && jointMonth / denom >= 0.55) {
    tips.push({
      id: 'tip-joint-share',
      title: 'Joint spending dominates this month',
      explanation: `About ${Math.round((jointMonth / denom) * 100)}% of categorized-style splits are joint—worth a quick look at shared categories in Overview.`,
      sparklineValues: totals6,
      ctaLabel: 'View joint budget',
      ctaHref: '/budget',
    });
  }

  const pa = transactions
    .filter((t) => t.budget_owner === 'person_a' && t.date.slice(0, 7) === anchorMonth)
    .reduce((s, t) => s + Number(t.amount), 0);
  const pb = transactions
    .filter((t) => t.budget_owner === 'person_b' && t.date.slice(0, 7) === anchorMonth)
    .reduce((s, t) => s + Number(t.amount), 0);
  if (pa > 80 && pb > 80 && Math.abs(pa - pb) / Math.max(pa, pb) >= 0.35) {
    const higher = pa > pb ? personAName : personBName;
    const lower = pa > pb ? personBName : personAName;
    tips.push({
      id: 'tip-person-compare',
      title: `${higher}’s personal slice is much higher than ${lower}’s`,
      explanation: `In ${getMonthYearDisplay(anchorMonth)}, personal-tagged spend skews toward ${higher}; check if that matches how you split costs.`,
      sparklineValues: totals6,
      ctaLabel: 'View transactions',
      ctaHref: `/transactions?month=${encodeURIComponent(anchorMonth)}&filter=categorized`,
    });
  }

  let upStreak = 0;
  for (let i = totals6.length - 1; i > 0; i--) {
    if (totals6[i] > totals6[i - 1]) upStreak++;
    else break;
  }
  if (upStreak >= 3) {
    tips.push({
      id: 'tip-up-streak',
      title: 'Total spend has climbed three months in a row',
      explanation: 'The last few calendar months show a rising trend in combined spending—use Overview to see which buckets moved.',
      sparklineValues: totals6,
      ctaLabel: 'Open budget overview',
      ctaHref: '/budget',
    });
  }

  const catTotals = new Map<string, { name: string; total: number }>();
  for (const t of transactions) {
    if (!t.is_categorized || !t.category_id || t.date.slice(0, 7) !== anchorMonth) continue;
    const id = t.category_id;
    const c = catTotals.get(id) || { name: t.category!.name, total: 0 };
    c.total += Number(t.amount);
    catTotals.set(id, c);
  }
  let topCat: { id: string; name: string; total: number } | null = null;
  for (const [id, v] of catTotals) {
    if (!topCat || v.total > topCat.total) topCat = { id, name: v.name, total: v.total };
  }
  const monthTotalCat = [...catTotals.values()].reduce((s, v) => s + v.total, 0);
  if (topCat && monthTotalCat > 0 && topCat.total / monthTotalCat >= 0.28) {
    const catTx = transactions.filter((t) => t.is_categorized && t.category_id && t.category);
    const series = categorySeries(catTx, topCat.id, months6);
    tips.push({
      id: 'tip-top-share',
      title: `${topCat.name} is a large share of spending`,
      explanation: `Roughly ${Math.round((topCat.total / monthTotalCat) * 100)}% of this month’s categorized spend is in ${topCat.name}.`,
      sparklineValues: series,
      ctaLabel: 'View category',
      ctaHref: `/transactions?month=${encodeURIComponent(anchorMonth)}&filter=categorized&category=${encodeURIComponent(topCat.id)}`,
    });
  }

  const fillers = [
    {
      title: 'Keep transactions categorized',
      explanation:
        'Consistent categories and owners make month-over-month insights and budget goals more accurate.',
      ctaLabel: 'Go to Import',
      ctaHref: '/dashboard/upload',
    },
    {
      title: 'Review your budget monthly',
      explanation:
        'Comparing actual spend to goals each month helps you catch drift before it compounds.',
      ctaLabel: 'Open budget',
      ctaHref: '/budget',
    },
    {
      title: 'Split joint vs personal deliberately',
      explanation:
        'Tagging the right budget owner keeps settlement math and per-person insights trustworthy.',
      ctaLabel: 'View transactions',
      ctaHref: `/transactions?month=${encodeURIComponent(anchorMonth)}&filter=categorized`,
    },
  ];
  let f = 0;
  while (tips.length < 3) {
    const item = fillers[f % fillers.length];
    f++;
    tips.push({
      id: `tip-filler-${tips.length}-${f}`,
      title: item.title,
      explanation: item.explanation,
      sparklineValues: totals6,
      ctaLabel: item.ctaLabel,
      ctaHref: item.ctaHref,
    });
  }

  return tips.slice(0, 3);
}
