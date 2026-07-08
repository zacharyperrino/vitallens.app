import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = 'https://nlxptctihrotizvaywdo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5seHB0Y3RpaHJvdGl6dmF5d2RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NjQ2NDQsImV4cCI6MjA5MDI0MDY0NH0.2yb8DEDKNvqMJleYujwTSAY1yhHNlI0r0IPscdUtflg';

// Anon key is safe to expose in the client — it is protected by row-level
// security. All privileged data access goes through the authenticated API.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);