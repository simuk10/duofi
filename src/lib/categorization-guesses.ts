import {
  buildCategorizationModel,
  predictCategory,
  type CategoryGuess,
  type CategorizationModel,
} from '@/lib/categorization-engine';
import type { Category, Transaction } from '@/types/database';

/** Minimum confidence to offer one-tap auto-apply (see leave-one-out eval). */
export const AUTO_APPLY_CONFIDENCE = 0.85;

export function buildHouseholdGuessModel(
  categorizedTransactions: Transaction[],
  categories: Category[]
): CategorizationModel {
  const validCategoryIds = new Set(categories.map((c) => c.id));
  const other = categories.find((c) => c.name.toLowerCase() === 'other');
  return buildCategorizationModel(categorizedTransactions, validCategoryIds, {
    otherCategoryId: other?.id ?? null,
  });
}

export function guessForUncategorized(
  tx: Transaction,
  model: CategorizationModel
): CategoryGuess | undefined {
  if (tx.is_categorized) return undefined;
  return predictCategory(tx, model);
}

export function confidenceTierLabel(tier: CategoryGuess['confidenceTier']): string {
  switch (tier) {
    case 'high':
      return 'High confidence';
    case 'medium':
      return 'Medium confidence';
    case 'low':
      return 'Low confidence';
    case 'guess':
      return 'Best guess';
  }
}

export function confidencePercent(confidence: number): number {
  return Math.round(confidence * 100);
}

export interface HighConfidenceTarget {
  transaction: Transaction;
  guess: CategoryGuess;
}

export function listHighConfidenceTargets(
  transactions: Transaction[],
  model: CategorizationModel,
  options?: { minConfidence?: number; excludeIds?: Set<string> }
): HighConfidenceTarget[] {
  const min = options?.minConfidence ?? AUTO_APPLY_CONFIDENCE;
  const exclude = options?.excludeIds ?? new Set<string>();
  const out: HighConfidenceTarget[] = [];

  for (const tx of transactions) {
    if (tx.is_categorized || exclude.has(tx.id)) continue;
    const guess = predictCategory(tx, model);
    if (guess.confidence >= min) {
      out.push({ transaction: tx, guess });
    }
  }
  return out;
}

export function guessSourceHint(source: CategoryGuess['source']): string {
  switch (source) {
    case 'exact':
      return 'exact prior match';
    case 'fingerprint':
      return 'similar merchant';
    case 'brand':
      return 'brand pattern';
    case 'fallback':
      return 'no close match';
  }
}

export interface QueuedGuess {
  transaction: Transaction;
  guess: CategoryGuess;
}

/** Transactions with category set but owner missing — owner review pass. */
export function listOwnerReviewQueue(
  transactions: Transaction[],
  options?: { excludeIds?: Set<string> }
): Transaction[] {
  const exclude = options?.excludeIds ?? new Set<string>();
  return transactions.filter(
    (tx) =>
      !tx.is_categorized &&
      !!tx.category_id &&
      !tx.budget_owner &&
      !exclude.has(tx.id)
  );
}

/** Uncategorized transactions below auto-apply threshold, for swipe categorization mode. */
export function listSwipeModeQueue(
  transactions: Transaction[],
  model: CategorizationModel,
  options?: { maxConfidence?: number }
): QueuedGuess[] {
  const max = options?.maxConfidence ?? AUTO_APPLY_CONFIDENCE;
  const out: QueuedGuess[] = [];

  for (const tx of transactions) {
    if (tx.is_categorized || tx.category_id) continue;
    const guess = predictCategory(tx, model);
    if (guess.confidence < max) {
      out.push({ transaction: tx, guess });
    }
  }

  // Medium-confidence first, then low, then wild guesses
  out.sort((a, b) => b.guess.confidence - a.guess.confidence);
  return out;
}
