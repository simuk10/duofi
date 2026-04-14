-- Additional policy to allow users to create households
-- Run this AFTER the initial schema if you've already set up the database

-- Allow any authenticated user to create a household
CREATE POLICY "Authenticated users can create households"
    ON households FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Allow users to delete their own budgets (to clear/reset budget goals)
-- This policy should already exist, but adding it here for completeness
-- If you get an error that it already exists, that's fine - skip this line
-- CREATE POLICY "Users can delete their household budgets"
--     ON budgets FOR DELETE
--     USING (household_id = get_user_household_id());
