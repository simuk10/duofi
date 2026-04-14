# DuoFi - Couples Budgeting & Settlement App

A secure, real-time, responsive web application designed for couples to track shared and individual expenses, monitor budget goals, and calculate exact settlement amounts based on CSV credit card statement uploads.

## Features

- **CSV Import**: Upload credit card statements and automatically parse transactions
- **Transaction Categorization**: Quickly categorize expenses with who the expense is for
- **Budget Tracking**: Set monthly budget goals for individual and joint expenses
- **Settlement Engine**: Automatically calculate who owes who based on spending patterns
- **Real-time Sync**: Changes sync instantly between devices using Supabase realtime
- **Secure**: Row-level security ensures only household members can access data

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Authentication, Realtime)
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Supabase account (free tier works perfectly)

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to your project's SQL Editor
3. Run all migration scripts in `supabase/migrations/` in filename order
4. This creates all tables, RLS policies, and default triggers

### 3. Configure Environment Variables

Copy the example env file and add your Supabase credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase project URL and anon key:
- Find these in your Supabase project: Settings > API

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Enable Supabase Realtime

In your Supabase dashboard:
1. Go to Database > Replication
2. Enable realtime for these tables:
   - transactions
   - categories
   - budgets
   - repayments
   - credit_cards

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage Guide

### 1. Create Your Household

- Sign up for an account
- Create a new household with you and your partner's names
- Share the household ID with your partner so they can join

### 2. Add Credit Cards

- Go to Credit Cards section
- Add each credit card you use
- Specify who pays each card (Person A, Person B, or Joint/50-50)

### 3. Upload Transactions

- Download CSV statements from your credit card providers
- Upload them in the Upload section
- Select which credit card the statement is from

### 4. Categorize Transactions

- Go to Transactions to see uncategorized items
- Assign a category (Groceries, Dining, etc.)
- Assign who the expense is for (Person A, Person B, or Joint)

### 5. Set Budgets

- Go to Budget section
- Set monthly budget goals for each category
- Track spending against goals for each person and joint expenses

### 6. Settle Up

- Go to Settlement section
- See who owes who based on the settlement rules
- Record payments when someone pays the other back

## Settlement Calculation Rules

The settlement engine follows these rules:

| Who Paid Card | Expense For | Who Owes |
|---------------|-------------|----------|
| Person A | Person A | No debt |
| Person A | Person B | B owes A 100% |
| Person A | Joint | B owes A 50% |
| Person B | Person B | No debt |
| Person B | Person A | A owes B 100% |
| Person B | Joint | A owes B 50% |
| Joint (50/50) | Joint | No debt |
| Joint (50/50) | Person A | A owes B 50% |
| Joint (50/50) | Person B | B owes A 50% |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── auth/              # Authentication pages
│   ├── dashboard/         # Dashboard, upload, cards, settings
│   ├── transactions/      # Transaction categorization
│   ├── budget/            # Budget tracking
│   └── settlement/        # Settlement calculations
├── components/
│   ├── layout/            # Navigation, header, app layout
│   └── ui/                # Reusable UI components
├── hooks/                 # Custom React hooks for data
├── lib/                   # Utilities and Supabase clients
│   ├── supabase/          # Supabase client configurations
│   ├── csv-parser.ts      # CSV parsing logic
│   ├── settlement.ts      # Settlement calculation engine
│   └── utils.ts           # General utilities
└── types/                 # TypeScript types
```

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import the project in Vercel
3. Add environment variables in Vercel project settings
4. Deploy!

## License

MIT
