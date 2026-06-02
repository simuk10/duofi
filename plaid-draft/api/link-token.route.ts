/**
 * DRAFT — copy to src/app/api/plaid/link-token/route.ts when ready.
 *
 * POST /api/plaid/link-token
 * - Requires Supabase session cookie
 * - Returns { link_token } for Plaid Link
 */
import { NextResponse } from "next/server";
import { createLinkToken } from "../lib/client";

export async function POST(req: Request) {
  // TODO when wiring:
  // const supabase = createServerClient(...);
  // const { data: { user } } = await supabase.auth.getUser();
  // if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const webhook = `${process.env.APP_URL}/api/plaid/webhook`;
  const { link_token, expiration } = await createLinkToken({
    userId: "REPLACE_WITH_USER_ID",
    webhook,
  });

  return NextResponse.json({ link_token, expiration });
}
