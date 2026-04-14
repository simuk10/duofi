'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks';
import { Button, Input, Card, CardContent } from '@/components/ui';
import { Users, UserPlus } from 'lucide-react';

type SetupMode = 'choose' | 'create' | 'join';

export default function SetupPage() {
  const [mode, setMode] = useState<SetupMode>('choose');
  const [householdName, setHouseholdName] = useState('');
  const [personAName, setPersonAName] = useState('');
  const [personBName, setPersonBName] = useState('');
  const [householdId, setHouseholdId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { createHousehold, joinHousehold, user, loading: authLoading } = useAuth();
  const router = useRouter();

  const toErrorMessage = (value: unknown) =>
    (() => {
      const message =
        value instanceof Error
          ? value.message
          : typeof value === 'string'
          ? value
          : 'Something went wrong. Please try again.';

      if (
        message.includes('row-level security policy for table "households"')
      ) {
        return 'Household creation is blocked by Supabase RLS policy. Run the latest migration in your Supabase SQL editor, then try again.';
      }

      return message;
    })();

  const handleCreateHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: createError } = await createHousehold(
        householdName,
        personAName,
        personBName
      );

      if (createError) {
        setError(toErrorMessage(createError));
      } else {
        router.replace('/transactions');
      }
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleJoinHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: joinError } = await joinHousehold(householdId);

      if (joinError) {
        setError(toErrorMessage(joinError));
      } else {
        router.replace('/transactions');
      }
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!authLoading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
        <div className="w-full max-w-md">
          <Card>
            <CardContent className="pt-6">
              <h1 className="text-xl font-semibold text-gray-900">Session expired</h1>
              <p className="mt-2 text-sm text-gray-600">
                Please sign in again, then continue household setup.
              </p>
              <Link href="/auth/login" className="mt-4 inline-block">
                <Button>Go to Sign In</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (mode === 'choose') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-100">
              <Users className="h-6 w-6 text-primary-600" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">
              Set up your household
            </h1>
            <p className="mt-2 text-gray-600">
              Create a new household or join an existing one
            </p>
          </div>

          <div className="space-y-4">
            <Card className="cursor-pointer hover:border-primary-300 transition-colors">
              <CardContent
                className="flex items-center gap-4 py-6"
                onClick={() => setMode('create')}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100">
                  <Users className="h-6 w-6 text-primary-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Create a Household
                  </h3>
                  <p className="text-sm text-gray-500">
                    Start fresh and invite your partner
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:border-primary-300 transition-colors">
              <CardContent
                className="flex items-center gap-4 py-6"
                onClick={() => setMode('join')}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary-100">
                  <UserPlus className="h-6 w-6 text-secondary-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Join a Household
                  </h3>
                  <p className="text-sm text-gray-500">
                    Join your partner&apos;s existing household
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900">
              Create your household
            </h1>
            <p className="mt-2 text-gray-600">
              Set up names for you and your partner
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleCreateHousehold} className="space-y-4">
                {error && (
                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <Input
                  label="Household Name"
                  type="text"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="The Smiths"
                  required
                />

                <Input
                  label="Your Name (Person A)"
                  type="text"
                  value={personAName}
                  onChange={(e) => setPersonAName(e.target.value)}
                  placeholder="John"
                  helperText="This is how you'll appear in the app"
                  required
                />

                <Input
                  label="Partner's Name (Person B)"
                  type="text"
                  value={personBName}
                  onChange={(e) => setPersonBName(e.target.value)}
                  placeholder="Jane"
                  helperText="They can change this when they join"
                  required
                />

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setMode('choose')}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    loading={loading}
                  >
                    Create Household
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Join a household
          </h1>
          <p className="mt-2 text-gray-600">
            Enter the household ID shared by your partner
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleJoinHousehold} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <Input
                label="Household ID"
                type="text"
                value={householdId}
                onChange={(e) => setHouseholdId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                helperText="Ask your partner for their household ID"
                required
              />

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMode('choose')}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  loading={loading}
                >
                  Join Household
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
