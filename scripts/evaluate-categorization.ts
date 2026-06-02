/**
 * Evaluate categorization accuracy on exported Duofi CSVs (leave-one-out).
 *
 *   npx tsx scripts/evaluate-categorization.ts \
 *     ~/Downloads/categories_rows.csv \
 *     ~/Downloads/transactions_rows\ \(1\).csv
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import Papa from 'papaparse';
import {
  buildCategorizationModel,
  guessCategoryMatches,
  guessMatchesActual,
  predictCategory,
  type CategoryGuess,
  type GuessSource,
} from '../src/lib/categorization-engine';
import type { BudgetOwner, Transaction } from '../src/types/database';

interface CategoryRow {
  id: string;
  name: string;
}

interface TransactionRow {
  id: string;
  date: string;
  description: string;
  amount: string;
  category_id: string;
  budget_owner: string;
  is_categorized: string;
}

function parseCsv<T>(path: string): T[] {
  const content = readFileSync(path, 'utf8');
  const result = Papa.parse<T>(content, { header: true, skipEmptyLines: true });
  return result.data;
}

function toTransaction(row: TransactionRow, householdId: string): Transaction | null {
  const isCat = row.is_categorized === 'true' || row.is_categorized === 't';
  if (!isCat || !row.category_id || !row.budget_owner) return null;
  const amount = parseFloat(row.amount);
  if (!Number.isFinite(amount)) return null;

  return {
    id: row.id,
    date: row.date,
    description: row.description,
    amount,
    credit_card_id: null,
    paid_by: 'joint',
    category_id: row.category_id,
    budget_owner: row.budget_owner as BudgetOwner,
    is_categorized: true,
    is_covered: false,
    covered_split: null,
    notes: null,
    household_id: householdId,
    created_at: '',
    updated_at: '',
  };
}

function pct(n: number, d: number): string {
  if (d === 0) return '—';
  return `${((n / d) * 100).toFixed(1)}%`;
}

function bar(confidence: number, width = 12): string {
  const filled = Math.round(confidence * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function main() {
  const categoriesPath = resolve(process.argv[2] ?? '');
  const transactionsPath = resolve(process.argv[3] ?? '');

  if (!process.argv[2] || !process.argv[3]) {
    console.error(
      'Usage: npx tsx scripts/evaluate-categorization.ts <categories.csv> <transactions.csv>'
    );
    process.exit(1);
  }

  const categories = parseCsv<CategoryRow>(categoriesPath);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const validCategoryIds = new Set(categories.map((c) => c.id));
  const otherCategory = categories.find((c) => c.name.toLowerCase() === 'other');
  const modelOpts = { otherCategoryId: otherCategory?.id ?? null };

  const rawTx = parseCsv<TransactionRow>(transactionsPath);
  const householdId = 'eval';
  const labeled = rawTx
    .map((r) => toTransaction(r, householdId))
    .filter((t): t is Transaction => t !== null);

  console.log('=== Categorization evaluation (leave-one-out) ===');
  console.log(`Categories: ${categories.length} · Labeled transactions: ${labeled.length}\n`);

  let catCorrect = 0;
  let fullCorrect = 0;
  const bySource: Record<GuessSource, { catOk: number; fullOk: number; n: number }> = {
    exact: { catOk: 0, fullOk: 0, n: 0 },
    fingerprint: { catOk: 0, fullOk: 0, n: 0 },
    brand: { catOk: 0, fullOk: 0, n: 0 },
    fallback: { catOk: 0, fullOk: 0, n: 0 },
  };
  const byTier: Record<CategoryGuess['confidenceTier'], { catOk: number; n: number }> = {
    high: { catOk: 0, n: 0 },
    medium: { catOk: 0, n: 0 },
    low: { catOk: 0, n: 0 },
    guess: { catOk: 0, n: 0 },
  };
  const wrongSamples: Array<{
    description: string;
    expected: string;
    guessed: string;
    confidence: number;
    source: GuessSource;
  }> = [];

  for (const target of labeled) {
    const train = labeled.filter((t) => t.id !== target.id);
    const model = buildCategorizationModel(train, validCategoryIds, modelOpts);
    const guess = predictCategory(target, model);

    const actual = {
      categoryId: target.category_id!,
      budgetOwner: target.budget_owner!,
    };
    const catOk = guessCategoryMatches(guess, actual.categoryId);
    const fullOk = guessMatchesActual(guess, actual);

    if (catOk) catCorrect++;
    if (fullOk) fullCorrect++;

    bySource[guess.source].n++;
    if (catOk) bySource[guess.source].catOk++;
    if (fullOk) bySource[guess.source].fullOk++;

    byTier[guess.confidenceTier].n++;
    if (catOk) byTier[guess.confidenceTier].catOk++;

    if (!catOk && wrongSamples.length < 25) {
      wrongSamples.push({
        description: target.description.slice(0, 55),
        expected: catName.get(actual.categoryId) ?? actual.categoryId,
        guessed: catName.get(guess.categoryId) ?? guess.categoryId,
        confidence: guess.confidence,
        source: guess.source,
      });
    }
  }

  const n = labeled.length;
  console.log('Overall (each txn held out once, trained on the rest):');
  console.log(`  Category correct:     ${catCorrect}/${n} (${pct(catCorrect, n)})`);
  console.log(`  Category + owner:     ${fullCorrect}/${n} (${pct(fullCorrect, n)})`);
  console.log('');

  console.log('By match source:');
  for (const [src, stats] of Object.entries(bySource) as [GuessSource, typeof bySource.exact][]) {
    if (stats.n === 0) continue;
    console.log(
      `  ${src.padEnd(12)} n=${String(stats.n).padStart(4)}  cat=${pct(stats.catOk, stats.n).padStart(6)}  full=${pct(stats.fullOk, stats.n).padStart(6)}`
    );
  }
  console.log('');

  console.log('By confidence tier (category accuracy):');
  for (const tier of ['high', 'medium', 'low', 'guess'] as const) {
    const s = byTier[tier];
    if (s.n === 0) continue;
    console.log(`  ${tier.padEnd(8)} n=${String(s.n).padStart(4)}  cat=${pct(s.catOk, s.n).padStart(6)}`);
  }
  console.log('');

  const autoApplyHigh = byTier.high;
  console.log(
    `Auto-apply threshold (high ≥0.85): ${autoApplyHigh.catOk}/${autoApplyHigh.n} category-correct (${pct(autoApplyHigh.catOk, autoApplyHigh.n)})`
  );
  console.log('');

  // Full model — score every labeled txn for distribution
  const fullModel = buildCategorizationModel(labeled, validCategoryIds, modelOpts);
  const allGuesses = labeled.map((t) => ({
    tx: t,
    guess: predictCategory(t, fullModel),
  }));

  console.log('Confidence distribution (full model, all labeled txns):');
  const buckets = [
    { label: '0.85–1.00 high', min: 0.85, max: 1.01 },
    { label: '0.65–0.84 medium', min: 0.65, max: 0.85 },
    { label: '0.40–0.64 low', min: 0.4, max: 0.65 },
    { label: '0.00–0.39 guess', min: 0, max: 0.4 },
  ];
  for (const b of buckets) {
    const inBucket = allGuesses.filter(
      (g) => g.guess.confidence >= b.min && g.guess.confidence < b.max
    );
    const ok = inBucket.filter((g) =>
      guessCategoryMatches(g.guess, g.tx.category_id!)
    ).length;
    console.log(
      `  ${b.label.padEnd(20)} n=${String(inBucket.length).padStart(4)}  acc=${pct(ok, inBucket.length).padStart(6)}`
    );
  }
  console.log('');

  console.log('Sample predictions (full model):');
  const samples = [...allGuesses]
    .sort((a, b) => b.guess.confidence - a.guess.confidence)
    .slice(0, 8);
  for (const { tx, guess } of samples) {
    const ok = guessCategoryMatches(guess, tx.category_id!);
    console.log(
      `  ${bar(guess.confidence)} ${guess.confidence.toFixed(2)} ${guess.source.padEnd(11)} ${ok ? '✓' : '✗'} ${tx.description.slice(0, 42)}`
    );
    console.log(
      `           → ${catName.get(guess.categoryId)} · ${guess.budgetOwner} (expected: ${catName.get(tx.category_id!)})`
    );
  }

  if (wrongSamples.length > 0) {
    console.log('\nSample misses (category wrong):');
    for (const w of wrongSamples.slice(0, 12)) {
      console.log(
        `  ${w.confidence.toFixed(2)} ${w.source.padEnd(10)} expected ${w.expected} got ${w.guessed}`
      );
      console.log(`    ${w.description}`);
    }
  }
}

main();
