import { createClient } from '@supabase/supabase-js';
import type { Database } from './schema.ts';

// Both values are public by design. Row-level security is what protects the data.
export const SUPABASE_URL = 'https://miyplubvsjgqhbkpixqy.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BcP3XR7v6KeaZZwF4iRfqQ_AUDQsMFx';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

/**
 * Makes sure this device has an anonymous session. The session lives in localStorage, so a
 * refresh or a locked phone comes back as the same player. Returns false if sign-in failed.
 */
export const ensureSession = async (): Promise<boolean> => {
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;
  const { error } = await supabase.auth.signInAnonymously();
  return !error;
};
