/**
 * Thin fetch wrapper that always sends credentials and surfaces 401s.
 *
 * Components SHOULD use this for any /api/* call. Use `useAuthFetch()` (from
 * @/features/auth/useAuth) when you also need the hook to clear local user
 * state on 401 — that variant chains through here.
 */
export async function authFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    credentials: 'include',
  });
}
