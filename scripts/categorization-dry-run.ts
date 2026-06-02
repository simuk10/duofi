/**
 * Offline accuracy check for categorization (exact + merchant fingerprint).
 *
 *   npx tsx scripts/categorization-dry-run.ts
 *   npx tsx scripts/categorization-dry-run.ts path/to/your-fixture.json
 *   npx tsx scripts/categorization-dry-run.ts --min-samples 1
 *
 * Fixture format: scripts/fixtures/categorization-sample.json
 * Export your own: categorized history + uncategorized targets with optional
 * expected_category_id / expected_budget_owner for accuracy scoring.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  formatDryRunReport,
  runCategorizationDryRun,
  type DryRunFixture,
} from '../src/lib/categorization-dry-run';

const DEFAULT_FIXTURE = resolve(
  __dirname,
  'fixtures/categorization-sample.json'
);

function parseArgs(argv: string[]) {
  let minSamples = 2;
  let fixturePath = DEFAULT_FIXTURE;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--min-samples' && argv[i + 1]) {
      minSamples = Math.max(1, parseInt(argv[++i], 10) || 2);
    } else if (!argv[i].startsWith('-')) {
      fixturePath = resolve(process.cwd(), argv[i]);
    }
  }
  return { minSamples, fixturePath };
}

const { minSamples, fixturePath } = parseArgs(process.argv);
const raw = readFileSync(fixturePath, 'utf8');
const fixture = JSON.parse(raw) as DryRunFixture;

const report = runCategorizationDryRun(fixture, { minSamples });
console.log(formatDryRunReport(report));
console.log(`\nFixture: ${fixturePath} · minSamples=${minSamples}`);
