const STORAGE_KEY = 'duofi_covered_suggestions_dismissed';

export function getDismissedCoveredSuggestions(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

export function dismissCoveredSuggestion(transactionId: string): void {
  if (typeof window === 'undefined') return;
  const set = getDismissedCoveredSuggestions();
  set.add(transactionId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export function undismissCoveredSuggestion(transactionId: string): void {
  if (typeof window === 'undefined') return;
  const set = getDismissedCoveredSuggestions();
  set.delete(transactionId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}
