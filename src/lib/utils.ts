import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

export function getCurrentMonthYear(ref: Date = new Date()): string {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Most recent calendar month that has fully ended (local time).
 * On April 13 → March YYYY-MM; on May 1 → April YYYY-MM.
 */
export function getLatestCompleteMonthYear(ref: Date = new Date()): string {
  const d = new Date(ref.getFullYear(), ref.getMonth(), 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** If `monthYear` is after the latest complete month, return the cap (YYYY-MM compares lexicographically). */
export function clampMonthYearToComplete(
  monthYear: string,
  ref: Date = new Date()
): string {
  const cap = getLatestCompleteMonthYear(ref);
  return monthYear > cap ? cap : monthYear;
}

export function getMonthYearDisplay(monthYear: string): string {
  const [year, month] = monthYear.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** Most recent month first; only fully completed calendar months (see {@link getLatestCompleteMonthYear}). */
export function getPreviousMonths(count: number, ref: Date = new Date()): string[] {
  const months: string[] = [];
  const latest = getLatestCompleteMonthYear(ref);
  const [y, m] = latest.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() - i, 1);
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    );
  }
  return months;
}

/** Shift YYYY-MM by delta calendar months (negative = past). */
export function addCalendarMonths(monthYear: string, deltaMonths: number): string {
  const [y, m] = monthYear.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return getLatestCompleteMonthYear();
  const d = new Date(y, m - 1 + deltaMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Oldest month (YYYY-MM) available when paging back (same depth as long history queries). */
export function getBudgetDrilldownOldestMonth(monthDepth = 120): string {
  const months = getPreviousMonths(monthDepth);
  return months[months.length - 1] ?? getLatestCompleteMonthYear();
}

/** Oldest-first YYYY-MM list for chart windows. offset 0 = latest `windowMonths` months. */
export function getChartMonthWindow(
  offset: number,
  windowMonths = 12,
  ref: Date = new Date()
): { keys: string[]; dateFrom: string; dateTo: string } {
  const keys: string[] = [];
  const [ay, am] = getLatestCompleteMonthYear(ref).split('-').map(Number);
  const anchor = new Date(ay, am - 1, 1);
  const startBack = windowMonths * (offset + 1) - 1;
  const endBack = windowMonths * offset;
  for (let monthsBack = startBack; monthsBack >= endBack; monthsBack--) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    d.setMonth(d.getMonth() - monthsBack);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const dateFrom = `${keys[0]}-01`;
  const [ey, em] = keys[keys.length - 1].split('-').map(Number);
  const endDate = new Date(ey, em, 0).toISOString().split('T')[0];
  return { keys, dateFrom, dateTo: endDate };
}

/** How far back the chart can slide (0-based offsets). 10 windows × 12 months = 10 years. */
export const CHART_MONTH_MAX_OFFSET = 9;
