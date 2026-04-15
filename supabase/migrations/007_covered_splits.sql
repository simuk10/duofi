-- Add "I Covered This" split-expense tracking to transactions
ALTER TABLE transactions
  ADD COLUMN is_covered BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN covered_split JSONB;
