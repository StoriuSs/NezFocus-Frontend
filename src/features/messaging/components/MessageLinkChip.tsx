import { Link } from 'react-router-dom'
import { Lock, MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/messaging'
import { WithTooltip } from '@/components/ui/tooltip'
import type { AppLink } from '../types'

/** A chip in a message's text: a message link, a channel mention. */
export const CHIP =
    'inline-flex max-w-[320px] items-center gap-1 rounded-badge bg-surface-2 px-1 text-body-sm font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0'

/**
 * A link to a message in a message (C-10 MessageLinkChip, D-48, D-117):
 * "#hoi-dap › Message" in `primary` on `surface-2`, the server named first
 * when it is another one; at most 320 wide, the server's name giving way
 * first (down to 80), then the channel's, the whole name in a Tooltip. It
 * opens the message in this tab. A message they cannot see: "Can't view"
 * with no name, and a click says so without leaving the page.
 */
export function MessageLinkChip({ link }: { link: Exclude<AppLink, { kind: 'page' }> }) {
    const { t } = useTranslation('messaging')

    if (link.kind === 'hidden') {
        return (
            <button
                type='button'
                onClick={() => toast(t('link.hiddenMessage'))}
                className={`${CHIP} text-text-secondary hover:bg-surface-3`}
            >
                <Lock aria-hidden='true' />
                {t('link.hidden')}
            </button>
        )
    }

    const name = `${link.server ? `${link.server} › ` : ''}#${link.channel} › ${t('link.message')}`
    return (
        <WithTooltip label={name}>
            <Link
                to={link.to}
                className={`${CHIP} text-primary transition-colors duration-micro hover:bg-surface-3 hover:text-text-primary`}
            >
                <MessageSquare aria-hidden='true' />
                {link.server ? (
                    <>
                        <span className='min-w-20 shrink-[999] truncate'>{link.server}</span>
                        {' › '}
                    </>
                ) : null}
                <span className='min-w-0 truncate'>#{link.channel}</span>
                {' › '}
                <span className='shrink-0'>{t('link.message')}</span>
            </Link>
        </WithTooltip>
    )
}
