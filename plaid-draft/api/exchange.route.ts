/**
 * DRAFT — copy to src/app/api/plaid/exchange/route.ts when ready.
 *
 * POST /api/plaid/exchange { public_token, institution_name?, paid_by }
 * - Exchange token, encrypt, insert plaid_items, run initial sync
 */
import { NextResponse } from "next/server";
import { exchangePublicToken } from "../../lib/client";
import { encryptPlaidAccessToken } from "../../lib/crypto";
import { syncPlaidItem } from "../../lib/sync";

export async function POST(req: Request) {
  const { public_token, institution_name, paid_by } = (await req.json()) as {
    public_token?: string;
    institution_name?: string;
    paid_by?: "person_a" | "person_b" | "joint";
  };

  if (!public_token) {
    return NextResponse.json({ error: "public_token required" }, { status: 400 });
  }

  const { access_token, item_id } = await exchangePublicToken(public_token);
  const access_token_encrypted = encryptPlaidAccessToken(access_token);

  // TODO: insert into plaid_items via SUPABASE_SERVICE_ROLE_KEY
  // const row = await supabaseAdmin.from('plaid_items').insert({...}).select().single();

  // TODO: await syncPlaidItem(row, supabaseAdmin, paid_by ?? 'joint');

  return NextResponse.json({
    ok: true,
    item_id,
    institution_name,
    message: "DRAFT — not persisted until wired",
  });
}
