import { useAuthStore } from '@/features/auth'
import { useProfile } from '@/features/users/api/useProfile'
import { UsernamePromptModal } from '@/features/users/components/UsernamePromptModal'

/**
 * Shows the username prompt while the signed-in user has none. Open is derived
 * from the profile, not held in state: when the username gets set anywhere
 * (this tab or another), the next profile fetch closes the prompt.
 */
export function UsernamePromptWrapper() {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const { data: profile } = useProfile(isAuthenticated)

    return <UsernamePromptModal open={isAuthenticated && profile?.hasSetUsername === false} />
}
