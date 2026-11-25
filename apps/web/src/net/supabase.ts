import { createClient } from '@supabase/supabase-js';
import type { Database } from './schema.ts';

// Both values are public by design. Row-level security is what protects the data.
const SUPABASE_URL = 'https://sam-server.tail17ca0b.ts.net:10000';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_dVEFSrdADSdHsi9We4soVb_QbXR4F2X';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

type SessionResult = 'ok' | 'rate-limited' | 'failed';

/**
 * Makes sure this device has an anonymous session. The session lives in localStorage, so a
 * refresh or a locked phone comes back as the same player.
 */
export const ensureSession = async (): Promise<SessionResult> => {
  const { data } = await supabase.auth.getSession();
  if (data.session) return 'ok';
  const { error } = await supabase.auth.signInAnonymously();
  if (!error) return 'ok';
  // Supabase limits new anonymous sign-ins per network address.
  return error.status === 429 ? 'rate-limited' : 'failed';
};
