/**
 * Convert Capital One-style CSV export → categorization dry-run fixture.
 * Holdout: transactions on/after --holdout-from are uncategorized targets.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import Papa from 'papaparse';
import {
  formatDryRunReport,
  runCategorizationDryRun,
} from '../src/lib/categorization-dry-run';

const BANK_CAT_TO_ID: Record<string, string> = {
  'Health Care': 'cat-health',
  Merchandise: 'cat-shopping',
  'Other Services': 'cat-services',
  Insurance: 'cat-insurance',
  Dining: 'cat-dining',
  'Gas/Automotive': 'cat-gas',
  'Other Travel': 'cat-travel',
  'Fee/Interest Charge': 'cat-fees',
};

const CATEGORIES = [
  { id: 'cat-health', name: 'Health Care' },
  { id: 'cat-shopping', name: 'Shopping' },
  { id: 'cat-services', name: 'Services' },
  { id: 'cat-insurance', name: 'Insurance' },
  { id: 'cat-dining', name: 'Dining' },
  { id: 'cat-gas', name: 'Gas' },
  { id: 'cat-travel', name: 'Travel' },
  { id: 'cat-fees', name: 'Fees' },
];

const SKIP_CATEGORIES = new Set(['Payment/Credit']);

interface CsvRow {
  'Transaction Date': string;
  Description: string;
  Category: string;
  Debit: string;
  Credit: string;
}

function parseAmount(debit: string, credit: string): number | null {
  const d = debit?.trim();
  if (d) {
    const n = parseFloat(d.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const c = credit?.trim();
  if (c) {
    const n = parseFloat(c.replace(/,/g, ''));
    return Number.isFinite(n) ? -n : null;
  }
  return null;
}

function main() {
  const csvPath = resolve(process.argv[2] ?? '');
  if (!process.argv[2]) {
    console.error('Usage: npx tsx scripts/csv-to-dry-run-fixture.ts <csv> [--holdout-from YYYY-MM-DD]');
    process.exit(1);
  }

  const holdoutFrom = process.argv.includes('--holdout-from')
    ? process.argv[process.argv.indexOf('--holdout-from') + 1]
    : '2026-03-01';

  const content = readFileSync(csvPath, 'utf8');
  const parsed = Papa.parse<CsvRow>(content, { header: true, skipEmptyLines: true });

  const transactions: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    is_categorized: boolean;
    category_id?: string;
    budget_owner?: 'person_a';
    expected_category_id?: string;
    expected_budget_owner?: 'person_a';
  }> = [];

  let i = 0;
  for (const row of parsed.data) {
    const cat = row.Category?.trim();
    if (!cat || SKIP_CATEGORIES.has(cat)) continue;

    const amount = parseAmount(row.Debit, row.Credit);
    if (amount === null || amount === 0) continue;

    const duofiCat = BANK_CAT_TO_ID[cat];
    if (!duofiCat) continue;

    const date = row['Transaction Date']?.trim();
    const description = row.Description?.trim();
    if (!date || !description) continue;

    const isHoldout = date >= holdoutFrom;
    i++;
    const tx = {
      id: `tx-${i}`,
      date,
      description,
      amount: Math.abs(amount),
      is_categorized: !isHoldout,
      budget_owner: 'person_a' as const,
    };

    if (isHoldout) {
      transactions.push({
        ...tx,
        expected_category_id: duofiCat,
        expected_budget_owner: 'person_a',
      });
    } else {
      transactions.push({
        ...tx,
        category_id: duofiCat,
        budget_owner: 'person_a',
      });
    }
  }

  const fixture = { categories: CATEGORIES, transactions };
  const outPath = resolve(__dirname, 'fixtures/user-export-dry-run.json');
  writeFileSync(outPath, JSON.stringify(fixture, null, 2));

  const report = runCategorizationDryRun(fixture);
  console.log(formatDryRunReport(report));
  console.log(`\nCSV: ${csvPath}`);
  console.log(`Holdout from: ${holdoutFrom} (targets = uncategorized)`);
  console.log(`History: ${transactions.filter((t) => t.is_categorized).length} · Targets: ${transactions.filter((t) => !t.is_categorized).length}`);
  console.log(`Fixture written: ${outPath}`);
}

main();
