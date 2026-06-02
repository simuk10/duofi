-- Server-side aggregates for Insights (scales to large transaction volumes).

CREATE INDEX IF NOT EXISTS idx_transactions_household_date_owner
  ON transactions(household_id, date, budget_owner);

CREATE OR REPLACE FUNCTION get_insights_aggregates(
  p_date_from DATE,
  p_date_to DATE,
  p_budget_owners budget_owner_type[] DEFAULT NULL,
  p_anchor_month TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_household_id UUID;
  v_anchor TEXT;
  v_prev TEXT;
  v_window_start DATE;
BEGIN
  v_household_id := get_user_household_id();
  IF v_household_id IS NULL THEN
    RETURN jsonb_build_object(
      'monthly_totals', '[]'::jsonb,
      'category_totals', '[]'::jsonb,
      'category_by_month', '[]'::jsonb,
      'top_vendors', '[]'::jsonb,
      'biggest_tx', NULL,
      'anchor_stats', NULL
    );
  END IF;

  v_anchor := COALESCE(
    p_anchor_month,
    to_char((date_trunc('month', CURRENT_DATE) - interval '1 month')::date, 'YYYY-MM')
  );
  v_prev := to_char(
    (to_date(v_anchor || '-01', 'YYYY-MM-DD') - interval '1 month')::date,
    'YYYY-MM'
  );
  v_window_start := (to_date(v_anchor || '-01', 'YYYY-MM-DD') - interval '5 months')::date;

  RETURN jsonb_build_object(
    'monthly_totals', (
      SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.month), '[]'::jsonb)
      FROM (
        SELECT to_char(t.date, 'YYYY-MM') AS month,
               ROUND(SUM(t.amount)::numeric, 2) AS total
        FROM transactions t
        WHERE t.household_id = v_household_id
          AND t.date >= p_date_from
          AND t.date <= p_date_to
          AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
        GROUP BY 1
      ) x
    ),
    'category_totals', (
      SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb)
      FROM (
        SELECT t.category_id,
               c.name AS category_name,
               ROUND(SUM(t.amount)::numeric, 2) AS total
        FROM transactions t
        JOIN categories c ON c.id = t.category_id
        WHERE t.household_id = v_household_id
          AND t.date >= p_date_from
          AND t.date <= p_date_to
          AND t.is_categorized = TRUE
          AND t.category_id IS NOT NULL
          AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
        GROUP BY t.category_id, c.name
      ) x
    ),
    'category_by_month', (
      SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.month, x.total DESC), '[]'::jsonb)
      FROM (
        SELECT to_char(t.date, 'YYYY-MM') AS month,
               t.category_id,
               c.name AS category_name,
               ROUND(SUM(t.amount)::numeric, 2) AS total
        FROM transactions t
        JOIN categories c ON c.id = t.category_id
        WHERE t.household_id = v_household_id
          AND t.date >= p_date_from
          AND t.date <= p_date_to
          AND t.is_categorized = TRUE
          AND t.category_id IS NOT NULL
          AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
        GROUP BY 1, t.category_id, c.name
      ) x
    ),
    'top_vendors', (
      SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.count DESC, x.total DESC), '[]'::jsonb)
      FROM (
        SELECT TRIM(t.description) AS description,
               COUNT(*)::int AS count,
               ROUND(SUM(t.amount)::numeric, 2) AS total
        FROM transactions t
        WHERE t.household_id = v_household_id
          AND t.date >= p_date_from
          AND t.date <= p_date_to
          AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
        GROUP BY TRIM(t.description)
        ORDER BY COUNT(*) DESC, SUM(t.amount) DESC
        LIMIT 6
      ) x
    ),
    'biggest_tx', (
      SELECT to_jsonb(x)
      FROM (
        SELECT t.id,
               ROUND(t.amount::numeric, 2) AS amount,
               t.description,
               t.date::text AS date,
               t.category_id,
               c.name AS category_name,
               t.is_categorized
        FROM transactions t
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.household_id = v_household_id
          AND t.date >= v_window_start
          AND t.date <= p_date_to
          AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
        ORDER BY t.amount DESC
        LIMIT 1
      ) x
    ),
    'anchor_stats', (
      SELECT jsonb_build_object(
        'anchor_month', v_anchor,
        'prev_month', v_prev,
        'this_total', COALESCE((
          SELECT ROUND(SUM(t.amount)::numeric, 2)
          FROM transactions t
          WHERE t.household_id = v_household_id
            AND to_char(t.date, 'YYYY-MM') = v_anchor
            AND t.date >= p_date_from
            AND t.date <= p_date_to
            AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
        ), 0),
        'last_total', COALESCE((
          SELECT ROUND(SUM(t.amount)::numeric, 2)
          FROM transactions t
          WHERE t.household_id = v_household_id
            AND to_char(t.date, 'YYYY-MM') = v_prev
            AND t.date >= p_date_from
            AND t.date <= p_date_to
            AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
        ), 0),
        'uncategorized_count', COALESCE((
          SELECT COUNT(*)::int
          FROM transactions t
          WHERE t.household_id = v_household_id
            AND to_char(t.date, 'YYYY-MM') = v_anchor
            AND t.date >= p_date_from
            AND t.date <= p_date_to
            AND t.is_categorized = FALSE
            AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
        ), 0),
        'uncategorized_amount', COALESCE((
          SELECT ROUND(SUM(t.amount)::numeric, 2)
          FROM transactions t
          WHERE t.household_id = v_household_id
            AND to_char(t.date, 'YYYY-MM') = v_anchor
            AND t.date >= p_date_from
            AND t.date <= p_date_to
            AND t.is_categorized = FALSE
            AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
        ), 0),
        'month_total', COALESCE((
          SELECT ROUND(SUM(t.amount)::numeric, 2)
          FROM transactions t
          WHERE t.household_id = v_household_id
            AND to_char(t.date, 'YYYY-MM') = v_anchor
            AND t.date >= p_date_from
            AND t.date <= p_date_to
            AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
        ), 0),
        'joint_amount', COALESCE((
          SELECT ROUND(SUM(t.amount)::numeric, 2)
          FROM transactions t
          WHERE t.household_id = v_household_id
            AND to_char(t.date, 'YYYY-MM') = v_anchor
            AND t.date >= p_date_from
            AND t.date <= p_date_to
            AND t.budget_owner = 'joint'
            AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
        ), 0),
        'personal_amount', COALESCE((
          SELECT ROUND(SUM(t.amount)::numeric, 2)
          FROM transactions t
          WHERE t.household_id = v_household_id
            AND to_char(t.date, 'YYYY-MM') = v_anchor
            AND t.date >= p_date_from
            AND t.date <= p_date_to
            AND t.budget_owner IN ('person_a', 'person_b')
            AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
        ), 0),
        'person_a_amount', COALESCE((
          SELECT ROUND(SUM(t.amount)::numeric, 2)
          FROM transactions t
          WHERE t.household_id = v_household_id
            AND to_char(t.date, 'YYYY-MM') = v_anchor
            AND t.date >= p_date_from
            AND t.date <= p_date_to
            AND t.budget_owner = 'person_a'
            AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
        ), 0),
        'person_b_amount', COALESCE((
          SELECT ROUND(SUM(t.amount)::numeric, 2)
          FROM transactions t
          WHERE t.household_id = v_household_id
            AND to_char(t.date, 'YYYY-MM') = v_anchor
            AND t.date >= p_date_from
            AND t.date <= p_date_to
            AND t.budget_owner = 'person_b'
            AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
        ), 0),
        'category_mom', COALESCE((
          SELECT jsonb_agg(row_to_json(x))
          FROM (
            SELECT cur.category_id,
                   cur.category_name,
                   cur.total AS this_amount,
                   COALESCE(prev.total, 0) AS prev_amount
            FROM (
              SELECT t.category_id,
                     c.name AS category_name,
                     ROUND(SUM(t.amount)::numeric, 2) AS total
              FROM transactions t
              JOIN categories c ON c.id = t.category_id
              WHERE t.household_id = v_household_id
                AND to_char(t.date, 'YYYY-MM') = v_anchor
                AND t.date >= p_date_from
                AND t.date <= p_date_to
                AND t.is_categorized = TRUE
                AND t.category_id IS NOT NULL
                AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
              GROUP BY t.category_id, c.name
            ) cur
            LEFT JOIN (
              SELECT t.category_id,
                     ROUND(SUM(t.amount)::numeric, 2) AS total
              FROM transactions t
              WHERE t.household_id = v_household_id
                AND to_char(t.date, 'YYYY-MM') = v_prev
                AND t.date >= p_date_from
                AND t.date <= p_date_to
                AND t.is_categorized = TRUE
                AND t.category_id IS NOT NULL
                AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
              GROUP BY t.category_id
            ) prev ON prev.category_id = cur.category_id
          ) x
        ), '[]'::jsonb),
        'monthly_totals_6mo', COALESCE((
          SELECT jsonb_agg(row_to_json(x) ORDER BY x.month)
          FROM (
            SELECT m.month,
                   COALESCE(ROUND(SUM(t.amount)::numeric, 2), 0) AS total
            FROM (
              SELECT to_char(
                (to_date(v_anchor || '-01', 'YYYY-MM-DD') - (n || ' months')::interval)::date,
                'YYYY-MM'
              ) AS month
              FROM generate_series(0, 5) AS n
            ) m
            LEFT JOIN transactions t
              ON t.household_id = v_household_id
             AND to_char(t.date, 'YYYY-MM') = m.month
             AND t.date >= p_date_from
             AND t.date <= p_date_to
             AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
            GROUP BY m.month
          ) x
        ), '[]'::jsonb),
        'top_category_share', (
          SELECT jsonb_build_object(
            'category_id', x.category_id,
            'category_name', x.category_name,
            'total', x.total,
            'month_categorized_total', x.month_total
          )
          FROM (
            SELECT t.category_id,
                   c.name AS category_name,
                   ROUND(SUM(t.amount)::numeric, 2) AS total,
                   (
                     SELECT ROUND(SUM(t2.amount)::numeric, 2)
                     FROM transactions t2
                     WHERE t2.household_id = v_household_id
                       AND to_char(t2.date, 'YYYY-MM') = v_anchor
                       AND t2.date >= p_date_from
                       AND t2.date <= p_date_to
                       AND t2.is_categorized = TRUE
                       AND t2.category_id IS NOT NULL
                       AND (p_budget_owners IS NULL OR t2.budget_owner = ANY(p_budget_owners))
                   ) AS month_total
            FROM transactions t
            JOIN categories c ON c.id = t.category_id
            WHERE t.household_id = v_household_id
              AND to_char(t.date, 'YYYY-MM') = v_anchor
              AND t.date >= p_date_from
              AND t.date <= p_date_to
              AND t.is_categorized = TRUE
              AND t.category_id IS NOT NULL
              AND (p_budget_owners IS NULL OR t.budget_owner = ANY(p_budget_owners))
            GROUP BY t.category_id, c.name
            ORDER BY SUM(t.amount) DESC
            LIMIT 1
          ) x
        )
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_insights_aggregates(DATE, DATE, budget_owner_type[], TEXT) TO authenticated;
