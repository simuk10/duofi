import { getLatestCompleteMonthYear } from '@/lib/utils';

export const IMPORT_PROGRESS_STORAGE_KEY = 'duofi_import_progress';

export interface ImportProgressPayload {
  monthYear: string;
  importedCount: number;
  /** True when CSV was pre-categorized — month may already be 100% */
  fullyCategorizedOnImport?: boolean;
  at: string;
}

export function dominantMonthFromDates(dates: string[]): string {
  if (dates.length === 0) return getLatestCompleteMonthYear();
  const counts = new Map<string, number>();
  for (const d of dates) {
    const k = d.slice(0, 7);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let best = dates[0].slice(0, 7);
  let max = 0;
  counts.forEach((n, k) => {
    if (n > max) {
      max = n;
      best = k;
    }
  });
  return best;
}

export function writeImportProgress(payload: ImportProgressPayload): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(IMPORT_PROGRESS_STORAGE_KEY, JSON.stringify(payload));
}

export function readImportProgress(): ImportProgressPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(IMPORT_PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImportProgressPayload;
  } catch {
    return null;
  }
}

export function clearImportProgress(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(IMPORT_PROGRESS_STORAGE_KEY);
}

export function monthCelebrationStorageKey(monthYear: string): string {
  return `duofi_month_closed_celebration_${monthYear}`;
}

export function hasCelebratedMonth(monthYear: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(monthCelebrationStorageKey(monthYear)) === '1';
}

export function markMonthCelebrated(monthYear: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(monthCelebrationStorageKey(monthYear), '1');
}
