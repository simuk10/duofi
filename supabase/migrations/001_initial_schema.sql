-- DuoFi Database Schema
-- Run this in your Supabase SQL Editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE budget_owner_type AS ENUM ('person_a', 'person_b', 'joint');
CREATE TYPE paid_by_type AS ENUM ('person_a', 'person_b', 'joint');

-- 1. Households table (groups users together)
CREATE TABLE households (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL DEFAULT 'My Household',
    person_a_name TEXT NOT NULL DEFAULT 'Person A',
    person_b_name TEXT NOT NULL DEFAULT 'Person B',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Users table (extends Supabase auth.users)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    household_id UUID REFERENCES households(id) ON DELETE SET NULL,
    role budget_owner_type DEFAULT 'person_a',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Credit Cards table
CREATE TABLE credit_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    last_four TEXT,
    paid_by paid_by_type NOT NULL DEFAULT 'joint',
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Categories table
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT DEFAULT '#6B7280',
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Transactions table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    credit_card_id UUID REFERENCES credit_cards(id) ON DELETE SET NULL,
    paid_by paid_by_type NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    budget_owner budget_owner_type,
    is_categorized BOOLEAN DEFAULT FALSE,
    notes TEXT,
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Budgets table (monthly budget goals)
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    month_year TEXT NOT NULL, -- Format: YYYY-MM
    budget_owner budget_owner_type NOT NULL,
    goal_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category_id, month_year, budget_owner, household_id)
);

-- 7. Repayments table (settlement transactions between partners)
CREATE TABLE repayments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    paid_by budget_owner_type NOT NULL,
    paid_to budget_owner_type NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    notes TEXT,
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT different_parties CHECK (paid_by != paid_to),
    CONSTRAINT valid_parties CHECK (paid_by IN ('person_a', 'person_b') AND paid_to IN ('person_a', 'person_b'))
);

-- Create indexes for better query performance
CREATE INDEX idx_transactions_household ON transactions(household_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_categorized ON transactions(is_categorized);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_budgets_month ON budgets(month_year);
CREATE INDEX idx_budgets_household ON budgets(household_id);
CREATE INDEX idx_repayments_household ON repayments(household_id);
CREATE INDEX idx_users_household ON users(household_id);

-- Row Level Security Policies

-- Enable RLS on all tables
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE repayments ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's household_id
CREATE OR REPLACE FUNCTION get_user_household_id()
RETURNS UUID AS $$
    SELECT household_id FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Households policies
CREATE POLICY "Users can view their own household"
    ON households FOR SELECT
    USING (id = get_user_household_id());

CREATE POLICY "Users can update their own household"
    ON households FOR UPDATE
    USING (id = get_user_household_id());

CREATE POLICY "Authenticated users can create households"
    ON households FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Users policies
CREATE POLICY "Users can view members of their household"
    ON users FOR SELECT
    USING (household_id = get_user_household_id() OR id = auth.uid());

CREATE POLICY "Users can update their own profile"
    ON users FOR UPDATE
    USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
    ON users FOR INSERT
    WITH CHECK (id = auth.uid());

-- Credit Cards policies
CREATE POLICY "Users can view their household credit cards"
    ON credit_cards FOR SELECT
    USING (household_id = get_user_household_id());

CREATE POLICY "Users can insert credit cards for their household"
    ON credit_cards FOR INSERT
    WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "Users can update their household credit cards"
    ON credit_cards FOR UPDATE
    USING (household_id = get_user_household_id());

CREATE POLICY "Users can delete their household credit cards"
    ON credit_cards FOR DELETE
    USING (household_id = get_user_household_id());

-- Categories policies
CREATE POLICY "Users can view their household categories"
    ON categories FOR SELECT
    USING (household_id = get_user_household_id());

CREATE POLICY "Users can insert categories for their household"
    ON categories FOR INSERT
    WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "Users can update their household categories"
    ON categories FOR UPDATE
    USING (household_id = get_user_household_id());

CREATE POLICY "Users can delete their household categories"
    ON categories FOR DELETE
    USING (household_id = get_user_household_id());

-- Transactions policies
CREATE POLICY "Users can view their household transactions"
    ON transactions FOR SELECT
    USING (household_id = get_user_household_id());

CREATE POLICY "Users can insert transactions for their household"
    ON transactions FOR INSERT
    WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "Users can update their household transactions"
    ON transactions FOR UPDATE
    USING (household_id = get_user_household_id());

CREATE POLICY "Users can delete their household transactions"
    ON transactions FOR DELETE
    USING (household_id = get_user_household_id());

-- Budgets policies
CREATE POLICY "Users can view their household budgets"
    ON budgets FOR SELECT
    USING (household_id = get_user_household_id());

CREATE POLICY "Users can insert budgets for their household"
    ON budgets FOR INSERT
    WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "Users can update their household budgets"
    ON budgets FOR UPDATE
    USING (household_id = get_user_household_id());

CREATE POLICY "Users can delete their household budgets"
    ON budgets FOR DELETE
    USING (household_id = get_user_household_id());

-- Repayments policies
CREATE POLICY "Users can view their household repayments"
    ON repayments FOR SELECT
    USING (household_id = get_user_household_id());

CREATE POLICY "Users can insert repayments for their household"
    ON repayments FOR INSERT
    WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "Users can delete their household repayments"
    ON repayments FOR DELETE
    USING (household_id = get_user_household_id());

-- Function to create default categories for a new household
CREATE OR REPLACE FUNCTION create_default_categories()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO categories (name, icon, color, household_id) VALUES
        ('Groceries', 'shopping-cart', '#22C55E', NEW.id),
        ('Dining Out', 'utensils', '#F97316', NEW.id),
        ('Transportation', 'car', '#3B82F6', NEW.id),
        ('Utilities', 'zap', '#EAB308', NEW.id),
        ('Entertainment', 'film', '#A855F7', NEW.id),
        ('Shopping', 'shopping-bag', '#EC4899', NEW.id),
        ('Healthcare', 'heart', '#EF4444', NEW.id),
        ('Travel', 'plane', '#06B6D4', NEW.id),
        ('Subscriptions', 'repeat', '#8B5CF6', NEW.id),
        ('Other', 'more-horizontal', '#6B7280', NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create default categories when a household is created
CREATE TRIGGER on_household_created
    AFTER INSERT ON households
    FOR EACH ROW
    EXECUTE FUNCTION create_default_categories();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_households_updated_at
    BEFORE UPDATE ON households
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_credit_cards_updated_at
    BEFORE UPDATE ON credit_cards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_budgets_updated_at
    BEFORE UPDATE ON budgets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Enable realtime for relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE budgets;
ALTER PUBLICATION supabase_realtime ADD TABLE repayments;
ALTER PUBLICATION supabase_realtime ADD TABLE credit_cards;
