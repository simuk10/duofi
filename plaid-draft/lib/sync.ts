/**
 * DRAFT — sync Plaid transactions into Duofi-shaped rows.
 * Uses service-role Supabase client (not bundled in live app).
 */
import { transactionsSync, type PlaidTransaction } from "./client";
import { decryptPlaidAccessToken } from "./crypto";

export interface PlaidItemRow {
  id: string;
  household_id: string;
  item_id: string;
  access_token_encrypted: string;
  sync_cursor: string | null;
  institution_name: string | null;
}

export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
  cursor: string;
}

/** Map Plaid txn → Duofi insert shape (categorization runs separately). */
export function mapPlaidToTransaction(
  tx: PlaidTransaction,
  householdId: string,
  paidBy: "person_a" | "person_b" | "joint"
) {
  return {
    household_id: householdId,
    date: tx.date,
    description: tx.name,
    amount: tx.amount,
    paid_by: paidBy,
    is_categorized: false,
    source: "plaid" as const,
    plaid_transaction_id: tx.transaction_id,
    plaid_account_id: tx.account_id,
    notes: tx.pending ? "pending" : null,
  };
}

/**
 * Full cursor loop for one Item. Caller provides Supabase admin client + item row.
 */
export async function syncPlaidItem(
  item: PlaidItemRow,
  supabaseAdmin: {
    from: (table: string) => {
      upsert: (rows: unknown[], opts?: { onConflict?: string }) => Promise<{ error: Error | null }>;
      update: (row: unknown) => { eq: (col: string, val: string) => Promise<{ error: Error | null }> };
      delete: () => { eq: (col: string, val: string) => Promise<{ error: Error | null }> };
    };
  },
  paidBy: "person_a" | "person_b" | "joint"
): Promise<SyncResult> {
  const accessToken = decryptPlaidAccessToken(item.access_token_encrypted);
  let cursor = item.sync_cursor;
  let added = 0;
  let modified = 0;
  let removed = 0;

  for (;;) {
    const page = await transactionsSync(accessToken, cursor);
    const upsertRows = [...page.added, ...page.modified].map((tx) =>
      mapPlaidToTransaction(tx, item.household_id, paidBy)
    );

    if (upsertRows.length > 0) {
      const { error } = await supabaseAdmin.from("transactions").upsert(upsertRows, {
        onConflict: "household_id,plaid_transaction_id",
      });
      if (error) throw error;
      added += page.added.length;
      modified += page.modified.length;
    }

    for (const r of page.removed) {
      const { error } = await supabaseAdmin
        .from("transactions")
        .delete()
        .eq("plaid_transaction_id", r.transaction_id);
      if (error) throw error;
      removed += 1;
    }

    cursor = page.next_cursor;
    if (!page.has_more) break;
  }

  await supabaseAdmin
    .from("plaid_items")
    .update({ sync_cursor: cursor, last_synced_at: new Date().toISOString() })
    .eq("id", item.id);

  return { added, modified, removed, cursor };
}
