/**
 * DRAFT — minimal Plaid HTTP client (no npm plaid package required for preview).
 * Use official `plaid` SDK when wiring into src/.
 */

const PLAID_HOST: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com",
};

function baseUrl(): string {
  const env = process.env.PLAID_ENV ?? "sandbox";
  return PLAID_HOST[env] ?? PLAID_HOST.sandbox;
}

function headers(): HeadersInit {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) throw new Error("Missing PLAID_CLIENT_ID or PLAID_SECRET");
  return {
    "Content-Type": "application/json",
    "PLAID-CLIENT-ID": clientId,
    "PLAID-SECRET": secret,
  };
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error_message?: string };
  if (!res.ok) {
    throw new Error((json as { error_message?: string }).error_message ?? `Plaid ${path} failed`);
  }
  return json;
}

export interface LinkTokenResponse {
  link_token: string;
  expiration: string;
}

export interface ExchangeResponse {
  access_token: string;
  item_id: string;
}

export interface SyncResponse {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: { transaction_id: string }[];
  next_cursor: string;
  has_more: boolean;
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_entity_id?: string | null;
  pending: boolean;
}

export function createLinkToken(input: {
  userId: string;
  webhook: string;
  redirectUri?: string;
}): Promise<LinkTokenResponse> {
  return post("/link/token/create", {
    user: { client_user_id: input.userId },
    client_name: "Duofi",
    products: ["transactions"],
    country_codes: ["US"],
    language: "en",
    webhook: input.webhook,
    redirect_uri: input.redirectUri,
  });
}

export function exchangePublicToken(publicToken: string): Promise<ExchangeResponse> {
  return post("/item/public_token/exchange", { public_token: publicToken });
}

export function transactionsSync(
  accessToken: string,
  cursor: string | null
): Promise<SyncResponse> {
  return post("/transactions/sync", {
    access_token: accessToken,
    cursor: cursor ?? undefined,
    count: 500,
  });
}

export function itemRemove(accessToken: string): Promise<{ removed: boolean }> {
  return post("/item/remove", { access_token: accessToken });
}
