import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, CONFIGURED } from './config.js';

export const sb = createClient(
  CONFIGURED ? SUPABASE_URL : 'https://example.supabase.co',
  CONFIGURED ? SUPABASE_ANON_KEY : 'placeholder',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'lexicraft-auth' } }
);
