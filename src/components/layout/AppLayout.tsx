'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navigation } from './Navigation';
import { useAuth } from '@/hooks';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, household, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/auth/login');
      } else if (!household) {
        router.push('/auth/setup');
      }
    }
  }, [user, household, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
      </div>
    );
  }

  if (!user || !household) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="max-w-md mx-auto bg-white min-h-screen shadow-xl relative">
        <main className="pb-20">{children}</main>
        <Navigation />
      </div>
    </div>
  );
}
