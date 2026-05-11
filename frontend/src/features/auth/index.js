/**
 * auth slice — JWT cookies + Google OAuth + login gate.
 *
 * Public surface:
 * - useAuth (default + named export): hook + AuthContext
 * - AuthProvider: wraps the app
 * - AuthGate: route-level gate that redirects to /api/auth/google when unauthenticated
 */
export { default as useAuth, AuthProvider } from './useAuth';
export { default as AuthGate } from './AuthGate';
