-- DRAFT ONLY — not applied to production.
-- Run manually when ready to enable Plaid.

CREATE TABLE plaid_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  linked_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL UNIQUE,
  institution_id TEXT,
  institution_name TEXT,
  access_token_encrypted TEXT NOT NULL,
  sync_cursor TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'login_required', 'removed')),
  last_synced_at TIMESTAMPTZ,
  last_webhook_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_plaid_items_household ON plaid_items(household_id);
CREATE INDEX idx_plaid_items_status ON plaid_items(status) WHERE status = 'active';

-- Link Plaid rows to existing transactions (dedupe vs CSV import)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS plaid_account_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'csv'
    CHECK (source IN ('csv', 'plaid'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_plaid_txn
  ON transactions(household_id, plaid_transaction_id)
  WHERE plaid_transaction_id IS NOT NULL;

ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;

-- Members can see linked banks metadata — NOT access_token_encrypted via client
CREATE POLICY "Household can view plaid item metadata"
  ON plaid_items FOR SELECT
  USING (household_id = get_user_household_id());

-- Inserts/updates/deletes only via service role (server routes), not anon client
