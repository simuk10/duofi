import {
  buildLearnedCategorySuggestions,
  getLearnedSuggestion,
  type LearnedCategorySuggestion,
} from '@/lib/category-suggestions';
import { merchantFingerprint } from '@/lib/merchant-fingerprint';
import type { BudgetOwner, Transaction } from '@/types/database';

export interface DryRunCategory {
  id: string;
  name: string;
}

/** Optional ground truth on uncategorized rows for accuracy scoring. */
export interface DryRunTransaction extends Pick<
  Transaction,
  | 'id'
  | 'description'
  | 'amount'
  | 'date'
  | 'is_categorized'
  | 'category_id'
  | 'budget_owner'
> {
  expected_category_id?: string;
  expected_budget_owner?: BudgetOwner;
}

export interface DryRunFixture {
  categories: DryRunCategory[];
  transactions: DryRunTransaction[];
}

export type SuggestionSource = 'exact' | 'fingerprint' | 'none';

export interface DryRunRowResult {
  id: string;
  description: string;
  amount: number;
  fingerprint: string;
  source: SuggestionSource;
  suggestion?: LearnedCategorySuggestion;
  expectedCategoryId?: string;
  expectedBudgetOwner?: BudgetOwner;
  correct?: boolean;
  categoryName?: string;
}

export interface DryRunMerchantGroup {
  fingerprint: string;
  label: string;
  count: number;
  totalAmount: number;
  suggestion?: LearnedCategorySuggestion;
  categoryName?: string;
  transactionIds: string[];
}

export interface DryRunReport {
  historyCount: number;
  targetCount: number;
  exactWouldApply: number;
  fingerprintWouldApply: number;
  eitherWouldApply: number;
  withGroundTruth: number;
  exactCorrect: number;
  fingerprintCorrect: number;
  eitherCorrect: number;
  rows: DryRunRowResult[];
  merchantGroups: DryRunMerchantGroup[];
}

function toTransaction(row: DryRunTransaction, householdId: string): Transaction {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    amount: row.amount,
    credit_card_id: null,
    paid_by: 'joint',
    category_id: row.category_id,
    budget_owner: row.budget_owner,
    is_categorized: row.is_categorized,
    is_covered: false,
    covered_split: null,
    notes: null,
    household_id: householdId,
    created_at: '',
    updated_at: '',
  };
}

function buildFingerprintSuggestions(
  history: Transaction[],
  options?: { minSamples?: number }
): Map<string, LearnedCategorySuggestion> {
  const minSamples = options?.minSamples ?? 2;
  const groups = new Map<
    string,
    Array<{ categoryId: string; budgetOwner: BudgetOwner }>
  >();

  for (const t of history) {
    if (!t.is_categorized || !t.category_id || !t.budget_owner) continue;
    const key = merchantFingerprint(t.description);
    if (!key) continue;
    const row = { categoryId: t.category_id, budgetOwner: t.budget_owner };
    const list = groups.get(key);
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

function matchesExpected(
  s: LearnedCategorySuggestion,
  expectedCategoryId?: string,
  expectedBudgetOwner?: BudgetOwner
): boolean | undefined {
  if (!expectedCategoryId || !expectedBudgetOwner) return undefined;
  return (
    s.categoryId === expectedCategoryId && s.budgetOwner === expectedBudgetOwner
  );
}

function pickSuggestion(
  tx: Transaction,
  exact: Map<string, LearnedCategorySuggestion>,
  fingerprint: Map<string, LearnedCategorySuggestion>,
  validCategoryIds: Set<string>
): { source: SuggestionSource; suggestion?: LearnedCategorySuggestion } {
  const exactS = getLearnedSuggestion(tx, exact, validCategoryIds);
  if (exactS) return { source: 'exact', suggestion: exactS };

  const fp = merchantFingerprint(tx.description);
  const fpS = fingerprint.get(fp);
  if (fpS && validCategoryIds.has(fpS.categoryId)) {
    return { source: 'fingerprint', suggestion: fpS };
  }
  return { source: 'none' };
}

/** Simulate post-sync auto-apply + review queue on a fixture or exported rows. */
export function runCategorizationDryRun(
  fixture: DryRunFixture,
  options?: { minSamples?: number }
): DryRunReport {
  const minSamples = options?.minSamples ?? 2;
  const householdId = 'dry-run';
  const validCategoryIds = new Set(fixture.categories.map((c) => c.id));
  const catName = new Map(fixture.categories.map((c) => [c.id, c.name]));

  const all = fixture.transactions.map((r) => toTransaction(r, householdId));
  const history = all.filter((t) => t.is_categorized);
  const targets = all.filter((t) => !t.is_categorized);

  const exactMap = buildLearnedCategorySuggestions(history, { minSamples });
  const fingerprintMap = buildFingerprintSuggestions(history, { minSamples });

  let exactWouldApply = 0;
  let fingerprintWouldApply = 0;
  let eitherWouldApply = 0;
  let withGroundTruth = 0;
  let exactCorrect = 0;
  let fingerprintCorrect = 0;
  let eitherCorrect = 0;

  const rows: DryRunRowResult[] = targets.map((tx) => {
    const raw = fixture.transactions.find((r) => r.id === tx.id)!;
    const { source, suggestion } = pickSuggestion(
      tx,
      exactMap,
      fingerprintMap,
      validCategoryIds
    );

    if (source === 'exact') exactWouldApply++;
    if (source === 'fingerprint') fingerprintWouldApply++;
    if (suggestion) eitherWouldApply++;

    const correct = suggestion
      ? matchesExpected(
          suggestion,
          raw.expected_category_id,
          raw.expected_budget_owner
        )
      : undefined;

    if (raw.expected_category_id && raw.expected_budget_owner) {
      withGroundTruth++;
      if (source === 'exact' && correct) exactCorrect++;
      if (source === 'fingerprint' && correct) fingerprintCorrect++;
      if (correct) eitherCorrect++;
    }

    return {
      id: tx.id,
      description: tx.description,
      amount: tx.amount,
      fingerprint: merchantFingerprint(tx.description),
      source,
      suggestion,
      expectedCategoryId: raw.expected_category_id,
      expectedBudgetOwner: raw.expected_budget_owner,
      correct,
      categoryName: suggestion ? catName.get(suggestion.categoryId) : undefined,
    };
  });

  const groupMap = new Map<string, DryRunMerchantGroup>();
  for (const row of rows) {
    const g = groupMap.get(row.fingerprint);
    if (g) {
      g.count++;
      g.totalAmount += row.amount;
      g.transactionIds.push(row.id);
    } else {
      groupMap.set(row.fingerprint, {
        fingerprint: row.fingerprint,
        label: row.fingerprint,
        count: 1,
        totalAmount: row.amount,
        suggestion: row.suggestion,
        transactionIds: [row.id],
      });
    }
  }
  for (const g of groupMap.values()) {
    const first = rows.find((r) => r.id === g.transactionIds[0]);
    g.suggestion = first?.suggestion;
    g.categoryName = first?.categoryName;
  }

  const merchantGroups = [...groupMap.values()].sort((a, b) => b.count - a.count);

  return {
    historyCount: history.length,
    targetCount: targets.length,
    exactWouldApply,
    fingerprintWouldApply,
    eitherWouldApply,
    withGroundTruth,
    exactCorrect,
    fingerprintCorrect,
    eitherCorrect,
    rows,
    merchantGroups,
  };
}

export function formatDryRunReport(report: DryRunReport): string {
  const lines: string[] = [];
  lines.push('=== Categorization dry run ===');
  lines.push(
    `History (categorized): ${report.historyCount} · Targets (uncategorized): ${report.targetCount}`
  );
  lines.push('');
  lines.push('Auto-apply simulation (min 2 agreeing history rows):');
  lines.push(`  Exact description match: ${report.exactWouldApply}/${report.targetCount}`);
  lines.push(
    `  Merchant fingerprint match: ${report.fingerprintWouldApply}/${report.targetCount}`
  );
  lines.push(`  Either (deduped per row): ${report.eitherWouldApply}/${report.targetCount}`);
  lines.push(
    `  Still need manual review: ${report.targetCount - report.eitherWouldApply}/${report.targetCount}`
  );

  if (report.withGroundTruth > 0) {
    lines.push('');
    lines.push(`Accuracy vs expected_* (${report.withGroundTruth} labeled rows):`);
    lines.push(
      `  Exact: ${report.exactCorrect}/${report.withGroundTruth} correct`
    );
    lines.push(
      `  Fingerprint: ${report.fingerprintCorrect}/${report.withGroundTruth} correct`
    );
    lines.push(
      `  Either: ${report.eitherCorrect}/${report.withGroundTruth} correct`
    );
  }

  if (report.merchantGroups.length > 0) {
    lines.push('');
    lines.push('Merchant groups (review UI preview):');
    for (const g of report.merchantGroups) {
      const sug = g.suggestion
        ? ` → ${g.categoryName ?? g.suggestion.categoryId} · ${g.suggestion.budgetOwner} (${g.suggestion.basedOnCount} history)`
        : ' → no suggestion';
      lines.push(
        `  ${g.label}: ${g.count} tx, $${g.totalAmount.toFixed(2)}${sug}`
      );
    }
  }

  lines.push('');
  lines.push('Per transaction:');
  for (const r of report.rows) {
    const sug =
      r.source === 'none'
        ? 'NONE'
        : `${r.source}: ${r.categoryName ?? '?'} · ${r.suggestion!.budgetOwner}`;
    const acc =
      r.correct === undefined ? '' : r.correct ? ' ✓' : ' ✗ WRONG';
    const exp =
      r.expectedCategoryId
        ? ` (expected ${r.expectedCategoryId} · ${r.expectedBudgetOwner})`
        : '';
    lines.push(`  [${r.id}] ${r.description.slice(0, 50)}`);
    lines.push(`       ${sug}${acc}${exp}`);
  }

  return lines.join('\n');
}
