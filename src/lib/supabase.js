import { createClient } from '@supabase/supabase-js';

// The anon key is public by design (row-level security protects data); it is
// read from the build environment so rotation never requires a code change.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://nlxptctihrotizvaywdo.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5seHB0Y3RpaHJvdGl6dmF5d2RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NjQ2NDQsImV4cCI6MjA5MDI0MDY0NH0.2yb8DEDKNvqMJleYujwTSAY1yhHNlI0r0IPscdUtflg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
