/**
 * Fetch categories + transactions from Supabase (requires SUPABASE_SERVICE_ROLE_KEY).
 *
 *   npx tsx scripts/fetch-app-export.ts
 *   npx tsx scripts/fetch-app-export.ts --household-id <uuid>
 */
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, requireEnv } from './load-env';

loadEnvLocal();

async function main() {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!serviceKey) {
    console.error(
      'Add SUPABASE_SERVICE_ROLE_KEY to .env.local (Supabase → Settings → API → service_role).\n' +
        'Or export app data manually and pass --app-export to dry-run-app-categories.ts'
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);
  let householdId = process.argv.includes('--household-id')
    ? process.argv[process.argv.indexOf('--household-id') + 1]
    : undefined;

  if (!householdId) {
    const { data: households, error } = await supabase
      .from('households')
      .select('id, name')
      .limit(5);
    if (error) throw error;
    if (!households?.length) {
      console.error('No households found.');
      process.exit(1);
    }
    householdId = households[0].id;
    console.log(`Using household: ${households[0].name ?? householdId}`);
  }

  const [{ data: categories, error: catErr }, { data: transactions, error: txErr }] =
    await Promise.all([
      supabase
        .from('categories')
        .select('id, name, icon, color')
        .eq('household_id', householdId)
        .order('name'),
      supabase
        .from('transactions')
        .select(
          'id, date, description, amount, category_id, budget_owner, is_categorized'
        )
        .eq('household_id', householdId)
        .order('date', { ascending: false }),
    ]);

  if (catErr) throw catErr;
  if (txErr) throw txErr;

  const payload = {
    exportedAt: new Date().toISOString(),
    householdId,
    categories: categories ?? [],
    transactions: transactions ?? [],
  };

  const outPath = resolve(__dirname, 'fixtures/app-export.json');
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(
    `Exported ${payload.categories.length} categories, ${payload.transactions.length} transactions → ${outPath}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
