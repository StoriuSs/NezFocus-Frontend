import type { ReactNode } from 'react'
import { useAuthStore } from '@/features/auth/auth.store'

/** Whether the signed-in user has a role. */
export function useHasRole(role: string): boolean {
    return useAuthStore((state) => state.user?.roles.includes(role) ?? false)
}

interface RequireRoleProps {
    role: string
    children: ReactNode
    /** Shown instead, for users without the role. Default: nothing. */
    fallback?: ReactNode
}

/**
 * Shows its children only to users with a role — hides admin actions,
 * or wraps an admin route. This is presentation only: the API must still
 * check the role (@Roles on the controller), because anything in the browser
 * can be changed by the user.
 */
export function RequireRole({ role, children, fallback = null }: RequireRoleProps) {
    return useHasRole(role) ? <>{children}</> : <>{fallback}</>
}
