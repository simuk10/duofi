/**
 * DRAFT — copy to src/app/api/plaid/webhook/route.ts when ready.
 *
 * POST /api/plaid/webhook
 * - Verify Plaid JWT (PLAID_WEBHOOK_VERIFICATION_KEY)
 * - On SYNC_UPDATES_AVAILABLE → sync that item_id
 */
import { NextResponse } from "next/server";

interface PlaidWebhookBody {
  webhook_type: string;
  webhook_code: string;
  item_id: string;
}

export async function POST(req: Request) {
  const rawBody = await req.text();

  // TODO when wiring — verify JWT from Plaid-Verification header:
  // import { jwtVerify, importJWK } from 'jose';
  // const token = req.headers.get('Plaid-Verification');
  // await jwtVerify(token, key, { maxTokenAge: '5 min' });

  const body = JSON.parse(rawBody) as PlaidWebhookBody;

  if (body.webhook_type === "TRANSACTIONS" && body.webhook_code === "SYNC_UPDATES_AVAILABLE") {
    // TODO: load plaid_items by item_id, call syncPlaidItem(...)
    // Update last_webhook_at
    console.info("[plaid-draft] would sync item", body.item_id);
  }

  if (body.webhook_code === "ITEM_LOGIN_REQUIRED") {
    // TODO: set plaid_items.status = 'login_required', notify user in UI
    console.info("[plaid-draft] login required", body.item_id);
  }

  // Always 200 quickly — do heavy work async if needed
  return NextResponse.json({ received: true });
}
