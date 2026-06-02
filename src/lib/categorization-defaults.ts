import type { CategoryGuess } from '@/lib/categorization-engine';
import type { BudgetOwner, PaidBy, Transaction } from '@/types/database';

/** Map card payer to budget owner (same enum values). */
export function paidByToBudgetOwner(paidBy: PaidBy): BudgetOwner {
  return paidBy;
}

/**
 * Default budget owner when swipe/quick-categorize focuses on category only.
 * Prefer the card's paid_by; joint cards fall back to the model guess.
 */
export function defaultBudgetOwnerForQuickCategorize(
  tx: Transaction,
  guess: CategoryGuess
): BudgetOwner {
  const paidBy = tx.credit_card?.paid_by ?? tx.paid_by;
  if (paidBy === 'person_a' || paidBy === 'person_b') {
    return paidBy;
  }
  return guess.budgetOwner;
}
