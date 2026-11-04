/**
 * What other features may use from auth. Everything else is internal and free
 * to move (an ESLint rule refuses deep imports from another feature). The app
 * shell in src/app and src/lib may still reach in, as it wires features up.
 */
export { useAuthStore } from './auth.store'
export { ProtectedRoute } from './components/ProtectedRoute'
export { RequireRole, useHasRole } from './components/RequireRole'
export { DeleteAccountDialog } from './components/DeleteAccountDialog'
export { AUTH_PATHS } from './lib/paths'
// For main.tsx, which connects the API client to the session.
export { apiSession } from './lib/api-session'
