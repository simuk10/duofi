export type BudgetOwner = 'person_a' | 'person_b' | 'joint';
export type PaidBy = 'person_a' | 'person_b' | 'joint';

export interface Household {
  id: string;
  name: string;
  person_a_name: string;
  person_b_name: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  household_id: string | null;
  role: BudgetOwner;
  created_at: string;
  updated_at: string;
}

export interface CreditCard {
  id: string;
  name: string;
  last_four: string | null;
  paid_by: PaidBy;
  household_id: string;
  created_at: string;
  updated_at: string;
}

export interface CardImport {
  id: string;
  household_id: string;
  credit_card_id: string;
  file_hash: string;
  date_from: string;
  date_to: string;
  transaction_count: number;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  household_id: string;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  household_id: string;
  created_at: string;
}

export interface CoveredSplitFriend {
  name: string;
  amount: number;
  status: 'pending' | 'sent';
}

export interface CoveredSplit {
  originalAmount: number;
  myShare: number;
  splitType: 'even' | 'itemized';
  friends: CoveredSplitFriend[];
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  credit_card_id: string | null;
  paid_by: PaidBy;
  category_id: string | null;
  budget_owner: BudgetOwner | null;
  is_categorized: boolean;
  is_covered: boolean;
  covered_split: CoveredSplit | null;
  notes: string | null;
  household_id: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  category?: Category;
  credit_card?: CreditCard;
  tags?: Tag[];
}

export interface Budget {
  id: string;
  category_id: string;
  month_year: string;
  budget_owner: BudgetOwner;
  goal_amount: number;
  household_id: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  category?: Category;
}

export interface Repayment {
  id: string;
  date: string;
  paid_by: BudgetOwner;
  paid_to: BudgetOwner;
  amount: number;
  notes: string | null;
  household_id: string;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      households: {
        Row: Household;
        Insert: Omit<Household, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Household, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      users: {
        Row: User;
        Insert: Omit<User, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      credit_cards: {
        Row: CreditCard;
        Insert: Omit<CreditCard, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CreditCard, 'id' | 'household_id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: Omit<Category, 'id' | 'created_at'>;
        Update: Partial<Omit<Category, 'id' | 'household_id' | 'created_at'>>;
        Relationships: [];
      };
      transactions: {
        Row: Transaction;
        Insert: Omit<Transaction, 'id' | 'created_at' | 'updated_at' | 'category' | 'credit_card'>;
        Update: Partial<Omit<Transaction, 'id' | 'household_id' | 'created_at' | 'updated_at' | 'category' | 'credit_card'>>;
        Relationships: [];
      };
      budgets: {
        Row: Budget;
        Insert: Omit<Budget, 'id' | 'created_at' | 'updated_at' | 'category'>;
        Update: Partial<Omit<Budget, 'id' | 'household_id' | 'created_at' | 'updated_at' | 'category'>>;
        Relationships: [];
      };
      repayments: {
        Row: Repayment;
        Insert: Omit<Repayment, 'id' | 'created_at'>;
        Update: Partial<Omit<Repayment, 'id' | 'household_id' | 'created_at'>>;
        Relationships: [];
      };
      card_imports: {
        Row: CardImport;
        Insert: Omit<CardImport, 'id' | 'created_at'>;
        Update: Partial<Omit<CardImport, 'id' | 'household_id' | 'created_at'>>;
        Relationships: [];
      };
      tags: {
        Row: Tag;
        Insert: Omit<Tag, 'id' | 'created_at'>;
        Update: Partial<Omit<Tag, 'id' | 'household_id' | 'created_at'>>;
        Relationships: [];
      };
      transaction_tags: {
        Row: {
          transaction_id: string;
          tag_id: string;
          created_at: string;
        };
        Insert: { transaction_id: string; tag_id: string };
        Update: Partial<{
          transaction_id: string;
          tag_id: string;
        }>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
  };
}
