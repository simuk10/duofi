/**
 * DRAFT — copy to src/app/api/plaid/cron-sync/route.ts when ready.
 *
 * GET /api/plaid/cron-sync
 * - Called by Vercel Cron once daily as webhook backup
 * - Protected by CRON_SECRET header (not public)
 */
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TODO when wiring:
  // const { data: items } = await supabaseAdmin
  //   .from('plaid_items')
  //   .select('*')
  //   .eq('status', 'active');
  //
  // for (const item of items ?? []) {
  //   try { await syncPlaidItem(item, supabaseAdmin, ...); }
  //   catch (e) { log item_id, continue; }
  // }

  return NextResponse.json({
    ok: true,
    message: "DRAFT — would sync all active plaid_items",
    synced: 0,
  });
}
