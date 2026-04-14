-- Track CSV uploads per credit card with date coverage (for monthly checklist + duplicate hints)

CREATE TABLE card_imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    credit_card_id UUID NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
    file_hash TEXT NOT NULL,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    transaction_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_card_imports_household ON card_imports(household_id);
CREATE INDEX idx_card_imports_card_dates ON card_imports(credit_card_id, date_from, date_to);
CREATE INDEX idx_card_imports_household_hash ON card_imports(household_id, file_hash);

ALTER TABLE card_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their household card imports"
    ON card_imports FOR SELECT
    USING (household_id = get_user_household_id());

CREATE POLICY "Users can insert card imports for their household"
    ON card_imports FOR INSERT
    WITH CHECK (household_id = get_user_household_id());
