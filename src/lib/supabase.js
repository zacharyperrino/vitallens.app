import { createClient } from '@supabase/supabase-js';

// The anon key is public by design (row-level security protects data); it is
// read from the build environment so rotation never requires a code change.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://nlxptctihrotizvaywdo.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
  || 'sb_publishable_QpWtQalfWCRbhXc58MJDhw_vtNJ--y0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
