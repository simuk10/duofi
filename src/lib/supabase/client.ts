import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser client without a generated `Database` generic: the hand-maintained
 * `Database` type in this repo does not satisfy PostgREST's `GenericSchema`
 * check in recent @supabase/supabase-js versions, which would collapse all
 * `.from()` calls to `never`. Runtime behavior is unchanged.
 */
let browserClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return browserClient;
}
