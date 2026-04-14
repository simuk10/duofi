import Link from 'next/link';
import { ArrowRight, Shield, Users, PieChart, RefreshCw } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white font-bold">
              D
            </div>
            <span className="text-xl font-bold text-gray-900">DuoFi</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/auth/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-32">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              Budgeting for{' '}
              <span className="text-primary-600">couples</span>,
              <br />
              made simple
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
              Track shared expenses, manage individual budgets, and settle up instantly.
              DuoFi helps couples stay on the same financial page with real-time sync
              and smart settlement calculations.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                href="/auth/signup"
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 text-base font-medium text-white hover:bg-primary-700"
              >
                Start Free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/auth/login"
                className="rounded-lg border-2 border-gray-300 px-6 py-3 text-base font-medium text-gray-700 hover:bg-gray-50"
              >
                Sign In
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-gray-200 bg-white py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold text-gray-900">
              Everything you need to manage shared finances
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100">
                  <Users className="h-6 w-6 text-primary-600" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">
                  Household Accounts
                </h3>
                <p className="mt-2 text-gray-600">
                  Invite your partner and manage finances together in one shared space.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-secondary-100">
                  <PieChart className="h-6 w-6 text-secondary-600" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">
                  Budget Tracking
                </h3>
                <p className="mt-2 text-gray-600">
                  Set individual and joint budget goals, track spending by category.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-green-100">
                  <RefreshCw className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">
                  Real-time Sync
                </h3>
                <p className="mt-2 text-gray-600">
                  Changes sync instantly across devices. Categorize together in real-time.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                  <Shield className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">
                  Secure & Private
                </h3>
                <p className="mt-2 text-gray-600">
                  Your data is encrypted and only accessible to your household.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-gray-50 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} DuoFi. Built for couples who budget together.
          </p>
        </div>
      </footer>
    </div>
  );
}
