import type { BudgetOwner, Transaction } from '@/types/database';

/** Normalize merchant / description text for matching prior categorizations. */
export function normalizeDescriptionForSuggestions(description: string): string {
  return description.trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface LearnedCategorySuggestion {
  categoryId: string;
  budgetOwner: BudgetOwner;
  /** How many categorized rows with this description agreed (all same cat + owner). */
  basedOnCount: number;
}

/**
 * Build a lookup from normalized description → category + budget owner when
 * every categorized transaction with that description used the same values.
 *
 * Requires at least `minSamples` prior rows (default 2) so a single noisy row
 * does not define a "pattern".
 */
export function buildLearnedCategorySuggestions(
  transactions: Transaction[],
  options?: { minSamples?: number }
): Map<string, LearnedCategorySuggestion> {
  const minSamples = options?.minSamples ?? 2;
  const groups = new Map<
    string,
    Array<{ categoryId: string; budgetOwner: BudgetOwner }>
  >();

  for (const t of transactions) {
    if (!t.is_categorized || !t.category_id || !t.budget_owner) continue;
    const key = normalizeDescriptionForSuggestions(t.description);
    if (!key) continue;
    const list = groups.get(key);
    const row = { categoryId: t.category_id, budgetOwner: t.budget_owner };
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const out = new Map<string, LearnedCategorySuggestion>();
  for (const [key, list] of groups) {
    if (list.length < minSamples) continue;
    const first = list[0];
    const same = list.every(
      (x) => x.categoryId === first.categoryId && x.budgetOwner === first.budgetOwner
    );
    if (!same) continue;
    out.set(key, {
      categoryId: first.categoryId,
      budgetOwner: first.budgetOwner,
      basedOnCount: list.length,
    });
  }
  return out;
}

export function getLearnedSuggestion(
  tx: Transaction,
  suggestions: Map<string, LearnedCategorySuggestion>,
  validCategoryIds: Set<string>
): LearnedCategorySuggestion | undefined {
  if (tx.is_categorized) return undefined;
  const key = normalizeDescriptionForSuggestions(tx.description);
  const s = suggestions.get(key);
  if (!s || !validCategoryIds.has(s.categoryId)) return undefined;
  return s;
}
