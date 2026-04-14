-- Clear all transaction rows so you can re-import a CSV.
-- Run in: Supabase Dashboard → SQL Editor → paste → Run.
-- Uses the database role (bypasses RLS). Affects every row in `transactions`.

DELETE FROM public.transactions;

-- Optional: only your household (replace with your household UUID from households table):
-- DELETE FROM public.transactions WHERE household_id = 'YOUR-HOUSEHOLD-UUID-HERE';
