import { useQuery } from '@tanstack/react-query'
import { authApi } from './auth.api'
import { authKeys } from './keys'

/** Whether two-step sign-in is on, and how many recovery codes are left. */
export function useTwoFactorStatus(enabled = true) {
    return useQuery({ queryKey: authKeys.twoFactorStatus(), queryFn: () => authApi.twoFactorStatus(), enabled })
}
