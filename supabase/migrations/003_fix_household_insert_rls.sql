-- Ensure authenticated users can create households.
-- Safe to run multiple times.

ALTER TABLE households ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can create households" ON households;

CREATE POLICY "Authenticated users can create households"
    ON households FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);
