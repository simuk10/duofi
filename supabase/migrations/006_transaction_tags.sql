-- Optional household tags for trips / short-term spend; many-to-many with transactions

CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX tags_household_name_lower ON tags (household_id, lower(trim(name)));

CREATE TABLE transaction_tags (
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (transaction_id, tag_id)
);

CREATE INDEX idx_transaction_tags_tag ON transaction_tags(tag_id);
CREATE INDEX idx_transaction_tags_transaction ON transaction_tags(transaction_id);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their household tags"
    ON tags FOR SELECT
    USING (household_id = get_user_household_id());

CREATE POLICY "Users can insert tags for their household"
    ON tags FOR INSERT
    WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "Users can update their household tags"
    ON tags FOR UPDATE
    USING (household_id = get_user_household_id());

CREATE POLICY "Users can delete their household tags"
    ON tags FOR DELETE
    USING (household_id = get_user_household_id());

CREATE POLICY "Users can view transaction_tags for their household"
    ON transaction_tags FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM transactions t
            WHERE t.id = transaction_tags.transaction_id
            AND t.household_id = get_user_household_id()
        )
    );

CREATE POLICY "Users can link tags to their transactions"
    ON transaction_tags FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM transactions t
            WHERE t.id = transaction_tags.transaction_id
            AND t.household_id = get_user_household_id()
        )
        AND EXISTS (
            SELECT 1 FROM tags g
            WHERE g.id = transaction_tags.tag_id
            AND g.household_id = get_user_household_id()
        )
    );

CREATE POLICY "Users can unlink tags from their transactions"
    ON transaction_tags FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM transactions t
            WHERE t.id = transaction_tags.transaction_id
            AND t.household_id = get_user_household_id()
        )
    );
