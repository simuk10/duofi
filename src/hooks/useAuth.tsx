'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { User, Household } from '@/types/database';

interface AuthState {
  user: AuthUser | null;
  profile: User | null;
  household: Household | null;
  loading: boolean;
  error: string | null;
}

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    name: string
  ) => Promise<{ error: string | null; user?: AuthUser | null }>;
  signOut: () => Promise<void>;
  createHousehold: (
    name: string,
    personAName: string,
    personBName: string
  ) => Promise<{ error: string | null }>;
  joinHousehold: (householdId: string) => Promise<{ error: string | null }>;
  refreshUserData: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    household: null,
    loading: true,
    error: null,
  });

  const supabase = createClient();

  const fetchUserData = useCallback(
    async (authUser: AuthUser) => {
      try {
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          throw profileError;
        }

        let household: Household | null = null;
        if (profile?.household_id) {
          const { data: householdData, error: householdError } = await supabase
            .from('households')
            .select('*')
            .eq('id', profile.household_id)
            .single();

          if (householdError && householdError.code !== 'PGRST116') {
            throw householdError;
          }
          household = householdData;
        }

        setState({
          user: authUser,
          profile: profile || null,
          household,
          loading: false,
          error: null,
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load user data',
        }));
      }
    },
    [supabase]
  );

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchUserData(session.user);
      } else {
        setState({
          user: null,
          profile: null,
          household: null,
          loading: false,
          error: null,
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, fetchUserData]);

  const signIn = async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const signInPromise = supabase.auth.signInWithPassword({
        email,
        password,
      });

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Sign-in timed out. Please reload and try again.')), 10000)
      );

      const { data, error } = await Promise.race([signInPromise, timeout]);

      if (error) {
        setState((prev) => ({ ...prev, loading: false, error: error.message }));
        return { error: error.message };
      }

      if (data.user) {
        await fetchUserData(data.user);
      }

      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setState((prev) => ({ ...prev, loading: false, error: message }));
      return { error: message };
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message }));
      return { error: error.message };
    }

    return { error: null, user: data.user };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setState({
      user: null,
      profile: null,
      household: null,
      loading: false,
      error: null,
    });
  };

  const getAuthenticatedUser = async () => {
    if (state.user) return state.user;
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return null;
    return user;
  };

  const createHousehold = async (
    name: string,
    personAName: string,
    personBName: string
  ) => {
    try {
      const authUser = await getAuthenticatedUser();
      if (!authUser) {
        return {
          error:
            'Not authenticated. Please sign in again, then create your household.',
        };
      }

      const householdId = crypto.randomUUID();

      const { error: householdError } = await supabase.from('households').insert({
        id: householdId,
        name,
        person_a_name: personAName,
        person_b_name: personBName,
      });

      if (householdError) {
        return { error: householdError.message };
      }

      const { error: updateError } = await supabase.from('users').upsert({
        id: authUser.id,
        email: authUser.email!,
        name: authUser.user_metadata?.name || null,
        household_id: householdId,
        role: 'person_a',
      });

      if (updateError) {
        return { error: updateError.message };
      }
      await fetchUserData(authUser);
      return { error: null };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Failed to create household',
      };
    }
  };

  const joinHousehold = async (householdId: string) => {
    try {
      const authUser = await getAuthenticatedUser();
      if (!authUser) {
        return {
          error:
            'Not authenticated. Please sign in again, then join a household.',
        };
      }

      const { error: updateError } = await supabase.from('users').upsert({
        id: authUser.id,
        email: authUser.email!,
        name: authUser.user_metadata?.name || null,
        household_id: householdId,
        role: 'person_b',
      });

      if (updateError) {
        if (updateError.code === '23503') {
          return { error: 'Household not found' };
        }
        return { error: updateError.message };
      }
      await fetchUserData(authUser);

      return { error: null };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Failed to join household',
      };
    }
  };

  const refreshUserData = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await fetchUserData(user);
    }
  };

  const value: AuthContextValue = {
    ...state,
    signIn,
    signUp,
    signOut,
    createHousehold,
    joinHousehold,
    refreshUserData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
