import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import '@/i18n/social'
import { WithTooltip } from '@/components/ui/tooltip'

/** Offline, a button is off with "You need a connection" (S-DM-02), on a span that can be hovered. */
export function Gated({ offline, children }: { offline: boolean; children: ReactNode }) {
    const { t } = useTranslation('social')
    if (!offline) return <>{children}</>
    return (
        <WithTooltip label={t('friends.offline')}>
            <span>{children}</span>
        </WithTooltip>
    )
}
