'use client';

import { AuthProvider } from '@/hooks';

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
