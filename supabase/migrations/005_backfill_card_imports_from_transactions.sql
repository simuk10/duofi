-- Backfill statement coverage for data imported before card_imports existed.
-- One row per (household, credit_card): date span = min/max transaction dates for that card.
-- file_hash is deterministic so this migration is safe to re-run.

INSERT INTO card_imports (
    household_id,
    credit_card_id,
    file_hash,
    date_from,
    date_to,
    transaction_count
)
SELECT
    agg.household_id,
    agg.credit_card_id,
    'legacy-transaction-span:' || agg.credit_card_id::text,
    agg.date_from,
    agg.date_to,
    agg.txn_count
FROM (
    SELECT
        household_id,
        credit_card_id,
        MIN(date)::date AS date_from,
        MAX(date)::date AS date_to,
        COUNT(*)::int AS txn_count
    FROM transactions
    WHERE credit_card_id IS NOT NULL
    GROUP BY household_id, credit_card_id
) agg
WHERE NOT EXISTS (
    SELECT 1
    FROM card_imports ci
    WHERE ci.file_hash = 'legacy-transaction-span:' || agg.credit_card_id::text
);
