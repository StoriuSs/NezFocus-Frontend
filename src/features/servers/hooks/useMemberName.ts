import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import '@/i18n/servers'
import type { ServerMember } from '../types'

/**
 * A member's name as shown: their name, else their username. An account
 * waiting to be deleted comes with neither (D-182): "Deleted account".
 */
export function useMemberName(): (member: Pick<ServerMember, 'displayName' | 'username'>) => string {
    const { t } = useTranslation('servers')
    return useCallback((member) => member.displayName ?? member.username ?? t('members.deleted'), [t])
}
