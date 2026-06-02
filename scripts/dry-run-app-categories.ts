/**
 * Dry-run categorization using Duofi app categories (not bank CSV labels).
 *
 * Modes:
 *   App-only holdout (best when you've categorized in Duofi):
 *     npx tsx scripts/dry-run-app-categories.ts --app-export scripts/fixtures/app-export.json --holdout-from 2026-03-01
 *
 *   App history + CSV new rows (ignores bank Category column):
 *     npx tsx scripts/dry-run-app-categories.ts --app-export ... --csv ~/Downloads/....csv --holdout-from 2026-03-01
 *
 * Fetch app export first (needs SUPABASE_SERVICE_ROLE_KEY in .env.local):
 *     npx tsx scripts/fetch-app-export.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import Papa from 'papaparse';
import {
  formatDryRunReport,
  runCategorizationDryRun,
  type DryRunFixture,
  type DryRunTransaction,
} from '../src/lib/categorization-dry-run';
import { normalizeDescriptionForSuggestions } from '../src/lib/category-suggestions';
import { loadEnvLocal } from './load-env';

loadEnvLocal();

interface AppExport {
  categories: Array<{ id: string; name: string }>;
  transactions: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    category_id: string | null;
    budget_owner: string | null;
    is_categorized: boolean;
  }>;
}

interface CsvRow {
  'Transaction Date': string;
  Description: string;
  Category: string;
  Debit: string;
  Credit: string;
}

const SKIP_BANK_CATEGORIES = new Set(['Payment/Credit']);

function parseArgs() {
  let appExport = resolve(__dirname, 'fixtures/app-export.json');
  let csvPath: string | undefined;
  let holdoutFrom = '2026-03-01';
  let minSamples = 2;

  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--app-export' && process.argv[i + 1]) appExport = resolve(process.argv[++i]);
    else if (a === '--csv' && process.argv[i + 1]) csvPath = resolve(process.argv[++i]);
    else if (a === '--holdout-from' && process.argv[i + 1]) holdoutFrom = process.argv[++i];
    else if (a === '--min-samples' && process.argv[i + 1]) {
      minSamples = Math.max(1, parseInt(process.argv[++i], 10) || 2);
    }
  }
  return { appExport, csvPath, holdoutFrom, minSamples };
}

function parseCsvAmount(debit: string, credit: string): number | null {
  const d = debit?.trim();
  if (d) {
    const n = parseFloat(d.replace(/,/g, ''));
    return Number.isFinite(n) ? Math.abs(n) : null;
  }
  const c = credit?.trim();
  if (c) {
    const n = parseFloat(c.replace(/,/g, ''));
    return Number.isFinite(n) ? Math.abs(n) : null;
  }
  return null;
}

/** Match CSV row to an app transaction (date + amount + description). */
function findAppMatch(
  appTx: AppExport['transactions'],
  date: string,
  description: string,
  amount: number
) {
  const norm = normalizeDescriptionForSuggestions(description);
  return appTx.find(
    (t) =>
      t.date === date &&
      Math.abs(Number(t.amount) - amount) < 0.02 &&
      normalizeDescriptionForSuggestions(t.description) === norm
  );
}

function buildFromAppOnly(
  app: AppExport,
  holdoutFrom: string
): { fixture: DryRunFixture; stats: string } {
  const categorized = app.transactions.filter(
    (t) => t.is_categorized && t.category_id && t.budget_owner
  );

  const history: DryRunTransaction[] = [];
  const targets: DryRunTransaction[] = [];

  for (const t of categorized) {
    const row: DryRunTransaction = {
      id: t.id,
      date: t.date,
      description: t.description,
      amount: Number(t.amount),
      is_categorized: t.date < holdoutFrom,
      category_id: t.date < holdoutFrom ? t.category_id! : undefined,
      budget_owner: t.date < holdoutFrom ? (t.budget_owner as DryRunTransaction['budget_owner']) : undefined,
    };
    if (t.date >= holdoutFrom) {
      row.is_categorized = false;
      row.expected_category_id = t.category_id!;
      row.expected_budget_owner = t.budget_owner as DryRunTransaction['budget_owner'];
      targets.push(row);
    } else {
      history.push(row);
    }
  }

  const fixture: DryRunFixture = {
    categories: app.categories.map((c) => ({ id: c.id, name: c.name })),
    transactions: [...history, ...targets],
  };

  return {
    fixture,
    stats: `App-only · history ${history.length} · targets ${targets.length} (your Duofi labels on/after ${holdoutFrom})`,
  };
}

function buildAppHistoryCsvTargets(
  app: AppExport,
  csvPath: string,
  holdoutFrom: string
): { fixture: DryRunFixture; stats: string } {
  const content = readFileSync(csvPath, 'utf8');
  const parsed = Papa.parse<CsvRow>(content, { header: true, skipEmptyLines: true });

  const history: DryRunTransaction[] = app.transactions
    .filter((t) => t.is_categorized && t.category_id && t.budget_owner && t.date < holdoutFrom)
    .map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: Number(t.amount),
      is_categorized: true,
      category_id: t.category_id!,
      budget_owner: t.budget_owner as DryRunTransaction['budget_owner'],
    }));

  const targets: DryRunTransaction[] = [];
  let matchedGroundTruth = 0;
  let i = 0;

  for (const row of parsed.data) {
    const bankCat = row.Category?.trim();
    if (!bankCat || SKIP_BANK_CATEGORIES.has(bankCat)) continue;

    const date = row['Transaction Date']?.trim();
    const description = row.Description?.trim();
    const amount = parseCsvAmount(row.Debit, row.Credit);
    if (!date || !description || amount === null || amount === 0) continue;
    if (date < holdoutFrom) continue;

    i++;
    const appMatch = findAppMatch(app.transactions, date, description, amount);
    const target: DryRunTransaction = {
      id: appMatch?.id ?? `csv-${i}`,
      date,
      description,
      amount,
      is_categorized: false,
    };

    if (appMatch?.is_categorized && appMatch.category_id && appMatch.budget_owner) {
      target.expected_category_id = appMatch.category_id;
      target.expected_budget_owner = appMatch.budget_owner as DryRunTransaction['budget_owner'];
      matchedGroundTruth++;
    }

    targets.push(target);
  }

  const fixture: DryRunFixture = {
    categories: app.categories.map((c) => ({ id: c.id, name: c.name })),
    transactions: [...history, ...targets],
  };

  return {
    fixture,
    stats:
      `App history ${history.length} · CSV targets ${targets.length} (bank Category ignored) · ` +
      `${matchedGroundTruth} matched to categorized rows in Duofi for accuracy scoring`,
  };
}

function printCategoryLegend(categories: DryRunFixture['categories']) {
  console.log('\nYour Duofi categories:');
  for (const c of categories) console.log(`  · ${c.name} (${c.id.slice(0, 8)}…)`);
}

async function main() {
  const { appExport, csvPath, holdoutFrom, minSamples } = parseArgs();

  if (!existsSync(appExport)) {
    console.error(`App export not found: ${appExport}`);
    console.error('Run: npx tsx scripts/fetch-app-export.ts');
    console.error('(requires SUPABASE_SERVICE_ROLE_KEY in .env.local)');
    process.exit(1);
  }

  const app = JSON.parse(readFileSync(appExport, 'utf8')) as AppExport;
  if (!app.categories?.length) {
    console.error('App export has no categories.');
    process.exit(1);
  }

  const { fixture, stats } = csvPath
    ? buildAppHistoryCsvTargets(app, csvPath, holdoutFrom)
    : buildFromAppOnly(app, holdoutFrom);

  printCategoryLegend(fixture.categories);
  console.log(`\n${stats}`);

  const report = runCategorizationDryRun(fixture, { minSamples });
  console.log('\n' + formatDryRunReport(report));
  console.log(`\nholdout-from=${holdoutFrom} · minSamples=${minSamples} · app-export=${appExport}`);
  if (csvPath) console.log(`csv=${csvPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
