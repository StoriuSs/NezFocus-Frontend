import { useEffect, useRef } from 'react'
import { Lock, Timer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { useToastEdge } from '@/hooks/useToastArea'
import { endsAtText } from '@/lib/time-zones'
import type { SendBlock } from '../types'

/**
 * The composer when one may not send (C-12 `disabled`): a line in place of
 * the box, its icon and why. `timer` "Timed out until 22:30 · you can't
 * send messages yet" (the day too when it ends on another, D-54); `lock` for
 * a channel only moderators post in, or a server that gives no
 * SEND_MESSAGES. The draft, the reply and the tray are kept, and come back
 * when one may send again.
 *
 * A status, which takes the focus the box had when it shut under someone
 * typing (the box gone, focus would fall to the page): a screen reader says
 * why. Focus anywhere else stays.
 */
export function ComposerDisabled({ blocked, now, timeZone }: { blocked: SendBlock; now: Date; timeZone?: string }) {
    const { t, i18n } = useTranslation('messaging')
    const Icon = blocked.reason === 'timed-out' ? Timer : Lock
    const line = useRef<HTMLParagraphElement>(null)
    // In the Composer's place: toasts sit 16 above it (C-16).
    const bar = useRef<HTMLDivElement>(null)
    useToastEdge('barTop', bar)
    useEffect(() => {
        const focused = document.activeElement
        if (!focused || focused === document.body) line.current?.focus()
    }, [])
    return (
        <div ref={bar} className='shrink-0 px-4 pb-4'>
            <p
                ref={line}
                role='status'
                tabIndex={-1}
                className='flex min-h-12 items-center gap-2 rounded-input bg-surface-1 px-3 py-2 text-label text-text-secondary focus:outline-none'
            >
                <Icon className='size-4 shrink-0' aria-hidden='true' />
                {blocked.reason === 'timed-out'
                    ? t('composer.disabled.timedOut', {
                          time: endsAtText(new Date(blocked.until), now, i18n.language, timeZone)
                      })
                    : t(
                          blocked.reason === 'managers-only'
                              ? 'composer.disabled.managersOnly'
                              : 'composer.disabled.noPermission'
                      )}
            </p>
        </div>
    )
}
