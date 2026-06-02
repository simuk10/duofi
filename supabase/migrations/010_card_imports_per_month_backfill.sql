-- Backfill per (household, card, calendar month) coverage from existing transactions.
-- Fixes checklist for data imported before per-month logging existed.

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
    'legacy-txn-month:' || agg.credit_card_id::text || ':' || agg.month_ym,
    agg.date_from,
    agg.date_to,
    agg.txn_count
FROM (
    SELECT
        household_id,
        credit_card_id,
        to_char(date, 'YYYY-MM') AS month_ym,
        date_trunc('month', MIN(date))::date AS date_from,
        (date_trunc('month', MIN(date)) + interval '1 month' - interval '1 day')::date AS date_to,
        COUNT(*)::int AS txn_count
    FROM transactions
    WHERE credit_card_id IS NOT NULL
    GROUP BY household_id, credit_card_id, to_char(date, 'YYYY-MM')
) agg
WHERE NOT EXISTS (
    SELECT 1
    FROM card_imports ci
    WHERE ci.household_id = agg.household_id
      AND ci.credit_card_id = agg.credit_card_id
      AND agg.month_ym >= to_char(ci.date_from, 'YYYY-MM')
      AND agg.month_ym <= to_char(ci.date_to, 'YYYY-MM')
);
