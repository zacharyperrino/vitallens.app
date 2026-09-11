import { supabase } from '../lib/supabase.js';
import { API_BASE } from '../config.js';

export async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) throw new Error('Not authenticated.');

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  // Don't set Content-Type for FormData — browser sets it automatically
  // with the correct multipart boundary
  const isFormData = options.body instanceof FormData;

  const signal = options.signal || AbortSignal.timeout(options.timeoutMs || 45_000);
  return fetch(url, {
    ...options,
    signal,
    headers: {
      ...(!isFormData && { 'Content-Type': 'application/json' }),
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}