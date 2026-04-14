import type { Transaction, Repayment, BudgetOwner, PaidBy } from '@/types/database';

export interface SettlementResult {
  totalOwedByA: number;
  totalOwedByB: number;
  netBalance: number;
  summary: string;
  personAOwes: boolean;
}

export interface TransactionDebt {
  transactionId: string;
  amount: number;
  owedBy: 'person_a' | 'person_b';
  owedTo: 'person_a' | 'person_b';
  description: string;
  date: string;
}

/**
 * Calculates how much debt a single transaction creates between partners.
 * 
 * Rules:
 * - Scenario 1: Person A pays the Credit Card.
 *   - If Expense = Person A: No one owes anything.
 *   - If Expense = Person B: Person B owes Person A 100%.
 *   - If Expense = Joint: Person B owes Person A 50%.
 * 
 * - Scenario 2: Person B pays the Credit Card.
 *   - If Expense = Person B: No one owes anything.
 *   - If Expense = Person A: Person A owes Person B 100%.
 *   - If Expense = Joint: Person A owes Person B 50%.
 * 
 * - Scenario 3: Credit Card is paid Joint (50/50).
 *   - If Expense = Joint: No one owes anything.
 *   - If Expense = Person A: Person A owes Person B 50%.
 *   - If Expense = Person B: Person B owes Person A 50%.
 */
export function calculateTransactionDebt(
  paidBy: PaidBy,
  budgetOwner: BudgetOwner,
  amount: number
): { owedBy: 'person_a' | 'person_b' | null; amount: number } {
  // Uncategorized transactions don't create debt
  if (!budgetOwner) {
    return { owedBy: null, amount: 0 };
  }

  // Scenario 1: Person A pays
  if (paidBy === 'person_a') {
    if (budgetOwner === 'person_a') {
      return { owedBy: null, amount: 0 };
    }
    if (budgetOwner === 'person_b') {
      return { owedBy: 'person_b', amount };
    }
    if (budgetOwner === 'joint') {
      return { owedBy: 'person_b', amount: amount / 2 };
    }
  }

  // Scenario 2: Person B pays
  if (paidBy === 'person_b') {
    if (budgetOwner === 'person_b') {
      return { owedBy: null, amount: 0 };
    }
    if (budgetOwner === 'person_a') {
      return { owedBy: 'person_a', amount };
    }
    if (budgetOwner === 'joint') {
      return { owedBy: 'person_a', amount: amount / 2 };
    }
  }

  // Scenario 3: Joint payment (50/50)
  if (paidBy === 'joint') {
    if (budgetOwner === 'joint') {
      return { owedBy: null, amount: 0 };
    }
    if (budgetOwner === 'person_a') {
      return { owedBy: 'person_a', amount: amount / 2 };
    }
    if (budgetOwner === 'person_b') {
      return { owedBy: 'person_b', amount: amount / 2 };
    }
  }

  return { owedBy: null, amount: 0 };
}

/**
 * Calculates the complete settlement between partners.
 * Returns the net balance and a human-readable summary.
 */
export function calculateSettlement(
  transactions: Transaction[],
  repayments: Repayment[],
  personAName: string = 'Person A',
  personBName: string = 'Person B'
): SettlementResult {
  let totalOwedByA = 0;
  let totalOwedByB = 0;

  // Calculate debt from transactions
  for (const tx of transactions) {
    if (!tx.is_categorized || !tx.budget_owner) continue;

    const debt = calculateTransactionDebt(tx.paid_by, tx.budget_owner, tx.amount);
    
    if (debt.owedBy === 'person_a') {
      totalOwedByA += debt.amount;
    } else if (debt.owedBy === 'person_b') {
      totalOwedByB += debt.amount;
    }
  }

  // Apply repayments
  for (const repayment of repayments) {
    if (repayment.paid_by === 'person_a' && repayment.paid_to === 'person_b') {
      totalOwedByA -= repayment.amount;
    } else if (repayment.paid_by === 'person_b' && repayment.paid_to === 'person_a') {
      totalOwedByB -= repayment.amount;
    }
  }

  // Net balance: positive means Person A owes Person B
  const netBalance = totalOwedByA - totalOwedByB;
  const personAOwes = netBalance > 0;

  let summary: string;
  if (Math.abs(netBalance) < 0.01) {
    summary = 'All settled up!';
  } else if (personAOwes) {
    summary = `${personAName} owes ${personBName}`;
  } else {
    summary = `${personBName} owes ${personAName}`;
  }

  return {
    totalOwedByA,
    totalOwedByB,
    netBalance,
    summary,
    personAOwes,
  };
}

/**
 * Gets detailed debt breakdown for each transaction
 */
export function getTransactionDebts(transactions: Transaction[]): TransactionDebt[] {
  const debts: TransactionDebt[] = [];

  for (const tx of transactions) {
    if (!tx.is_categorized || !tx.budget_owner) continue;

    const debt = calculateTransactionDebt(tx.paid_by, tx.budget_owner, tx.amount);
    
    if (debt.owedBy && debt.amount > 0) {
      const owedTo = debt.owedBy === 'person_a' ? 'person_b' : 'person_a';
      debts.push({
        transactionId: tx.id,
        amount: debt.amount,
        owedBy: debt.owedBy,
        owedTo,
        description: tx.description,
        date: tx.date,
      });
    }
  }

  return debts;
}
