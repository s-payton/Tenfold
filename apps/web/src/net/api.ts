import { FunctionRegion } from '@supabase/supabase-js';
import type { Action, ActionResult, ServerError } from '@tenfold/server';
import { ensureSession, supabase } from './supabase.ts';

export type ApiError = ServerError | { readonly code: 'offline' | 'no-session' };
export type ApiResult = Extract<ActionResult, { ok: true }> | { readonly ok: false; readonly error: ApiError };

/** Sends one request to the referee Edge Function. */
export const callGame = async (action: Action): Promise<ApiResult> => {
  if (!(await ensureSession())) return { ok: false, error: { code: 'no-session' } };
  try {
    // Run the function next to the database, so its queries stay short.
    const response = await supabase.functions.invoke<ActionResult>('game', {
      body: action,
      region: FunctionRegion.UsEast1,
    });
    return response.data ?? { ok: false, error: { code: 'offline' } };
  } catch {
    return { ok: false, error: { code: 'offline' } };
  }
};
