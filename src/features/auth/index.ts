/**
 * What other features may use from auth. Everything else is internal and free
 * to move (an ESLint rule refuses deep imports from another feature). The app
 * shell in src/app and src/lib may still reach in, as it wires features up.
 */
export { useAuthStore } from './auth.store'
export { ProtectedRoute } from './components/ProtectedRoute'
export { RequireRole, useHasRole } from './components/RequireRole'
export { AUTH_PATHS, withFlow } from './lib/paths'
// The wait a limit asks for (C-22), for other features' forms.
export { formatWait } from './lib/form-errors'
// For main.tsx, which connects the API client to the session.
export { apiSession } from './lib/api-session'
