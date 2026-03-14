export const ORBIT_AUTH_INVALID_EVENT = 'orbit:auth-invalid';

const ORBIT_STORAGE_PREFIXES = ['orbit_', 'orbit-', 'sb-', 'supabase.auth', 'supabase-auth-token', 'supabase'];
const ORBIT_STORAGE_CONTAINS = ['supabase', 'orbit'];

export const clearOrbitStorage = () => {
  const clearByPrefixes = (storage?: Storage | null) => {
    if (!storage) return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      if (
        ORBIT_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
        ORBIT_STORAGE_CONTAINS.some((keyword) => key.includes(keyword))
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        storage.removeItem(k);
      } catch (e) {
        console.warn('Failed to remove cached item', k, e);
      }
    });
  };

  try {
    clearByPrefixes(typeof window !== 'undefined' ? window.localStorage : undefined);
    clearByPrefixes(typeof window !== 'undefined' ? window.sessionStorage : undefined);
  } catch (err) {
    console.warn('Orbit cache clear error:', err);
  }
};

export const isLikelyInvalidSession = (message?: string | null) => {
  if (!message) return false;
  const lower = message.toLowerCase();
  return [
    'invalid jwt',
    'invalid_jwt',
    'invalid token',
    'jwt expired',
    'token has expired',
    'expired token',
    'refresh_token_not_found',
    'session not found',
    'auth session missing',
    'invalid refresh token',
    'bad_jwt',
    'jwt malformed',
    'invalid_grant',
  ].some((fragment) => lower.includes(fragment));
};

export const emitInvalidAuthEvent = (reason?: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ORBIT_AUTH_INVALID_EVENT, { detail: { reason } }));
};
