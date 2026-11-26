import { Phone, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/social'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useMyCall } from '../../api/useMyCall'
import { useCallPress } from '../../hooks/useCallPress'
import { nameOf } from '../../lib/friends-list'

/**
 * Gọi thoại · Gọi video of a DM's Header (C-07 `dm`, 09 S-DM-03): shown
 * only where I may message them (the page leaves them out otherwise, Q10).
 * Off, still focusable for their Tooltip, while offline (09 › Ma trận) or
 * while a call of mine is going on anywhere (09 › Một cuộc gọi một lúc):
 * "Bạn đang trong cuộc gọi với {Chi}", on the call's own page "Bạn đang trong
 * cuộc gọi này" (C-07 `dm`).
 */
export function CallButtons({ dmId, offline }: { dmId: string; offline: boolean }) {
    const { t } = useTranslation('social')
    const { t: tc } = useTranslation()
    const current = useMyCall((my) => my.current).data ?? null
    const { call } = useCallPress()
    const why = offline
        ? tc('shell.messages.offline')
        : current
          ? current.dmId === dmId
              ? t('call.inThisCall')
              : t('call.inCallWith', { name: nameOf(current.user) ?? '' })
          : null
    const button = (video: boolean) => {
        const label = t(video ? 'call.videoCall' : 'call.voiceCall')
        return (
            <WithTooltip label={why ?? label} side='bottom'>
                <IconButton
                    label={why ? `${label}: ${why}` : label}
                    aria-disabled={why ? true : undefined}
                    className={cn(why && 'text-text-tertiary')}
                    onClick={why ? undefined : () => void call(dmId, video)}
                >
                    {video ? <Video /> : <Phone />}
                </IconButton>
            </WithTooltip>
        )
    }
    return (
        <>
            {button(false)}
            {button(true)}
        </>
    )
}
