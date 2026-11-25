import { useContext, useRef, type ReactNode } from 'react'
import { Menu, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useToastEdge } from '@/hooks/useToastArea'
import { SHELL_LIST_ID, SHELL_NAV_BUTTON_ID, ShellContext } from './shell-context'
import { ConnectionBanner } from './ConnectionBanner'
import { IconButton } from '@/components/ui/icon-button'

/**
 * A page in the AppShell's content area: the 48-high Header (C-07) over a
 * scrolling body, and an optional right panel beside both (C-08).
 *
 * Header: ☰ below 1024 (opens the navigation), an optional icon, the title
 * (`headline` 600, cut with … when long), then the page's actions, which
 * always stay visible.
 *
 * Under the Header, the connection Banner when the AppShell has one (C-16).
 * `composer`: the page has a message box, so offline says messages will be
 * sent later. `reconnecting`: the page's own link is coming back (the voice
 * room's, 07 S-ROOM-06): the `reconnecting` Banner too, one connection Banner
 * at a time (C-16). `bare`: no Header from 1024 up, and below only its ☰ (11
 * S-MOD-06), the title left to screen readers. `overlay`: drawn inside the
 * content column, which it may cover from the Header down (the chat's cover
 * for dropped files, C-12 `drop-target`); the right panel stays uncovered.
 * `afterTitle`: right after the title, which gives way to it (a study room's
 * Host chip, C-07 `room`). `className`: the content column's ground, the
 * Header in (a room's phase colour, 07 › Quy ước).
 *
 * A person's page (C-07 `dm`): `leading` in the icon's place (their avatar),
 * `subtitle` after the title (their username, `label` `text-tertiary`), cut
 * before the title when short of room (D-108); `status` after it (their
 * activity line, C-07 `dm`, C-30), cut before the buttons.
 */
export function ShellPage({
    title,
    icon: Icon,
    actions,
    panel,
    children,
    bodyClassName,
    composer = false,
    reconnecting = false,
    bare = false,
    overlay,
    afterTitle,
    leading,
    subtitle,
    status,
    className
}: {
    title: string
    icon?: LucideIcon
    actions?: ReactNode
    panel?: ReactNode
    children?: ReactNode
    bodyClassName?: string
    composer?: boolean
    reconnecting?: boolean
    bare?: boolean
    overlay?: ReactNode
    afterTitle?: ReactNode
    leading?: ReactNode
    subtitle?: string
    status?: ReactNode
    className?: string
}) {
    const { t } = useTranslation()
    const shell = useContext(ShellContext)
    // The content area: toasts keep to its bottom right (C-16).
    const area = useRef<HTMLElement>(null)
    useToastEdge('contentRight', area)
    const connection = shell?.connection ?? (reconnecting ? 'reconnecting' : null)

    return (
        <>
            <section
                ref={area}
                className={cn('flex min-w-0 flex-1 flex-col', overlay !== undefined && 'relative', className)}
            >
                <header className={cn('flex h-12 shrink-0 items-center gap-2 border-b px-4', bare && 'lg:hidden')}>
                    {shell ? (
                        <WithTooltip label={t('shell.openNav')} side='bottom'>
                            <IconButton
                                id={SHELL_NAV_BUTTON_ID}
                                label={t('shell.openNav')}
                                aria-expanded={shell.navOpen}
                                aria-controls={SHELL_LIST_ID}
                                on={shell.navOpen}
                                onClick={shell.toggleNav}
                                className='lg:hidden'
                            >
                                <Menu />
                            </IconButton>
                        </WithTooltip>
                    ) : null}
                    {leading ??
                        (Icon ? <Icon className='size-5 shrink-0 text-text-tertiary' aria-hidden='true' /> : null)}
                    <h1
                        className={cn(
                            'min-w-0 truncate text-headline text-text-primary',
                            !afterTitle && !subtitle && 'flex-1',
                            bare && 'sr-only'
                        )}
                        title={title}
                    >
                        {title}
                    </h1>
                    {subtitle ? (
                        // Shrinks 999 times faster than the title: the username goes first.
                        <span
                            style={{ flexShrink: 999 }}
                            className={cn('min-w-0 truncate text-label text-text-tertiary', !status && 'flex-1')}
                        >
                            {subtitle}
                        </span>
                    ) : null}
                    {/* Grows from its own width (flex 1 1 auto), so the username gives way first. Inline: one use. */}
                    {status ? (
                        <div style={{ flex: '1 1 auto' }} className='flex min-w-0 items-center'>
                            {status}
                        </div>
                    ) : null}
                    {afterTitle ? <div className='flex shrink-0 grow items-center'>{afterTitle}</div> : null}
                    {actions ? <div className='flex shrink-0 items-center gap-1'>{actions}</div> : null}
                </header>
                {connection ? <ConnectionBanner status={connection} composer={composer} /> : null}
                <div className={cn('min-h-0 flex-1 overflow-y-auto', bodyClassName)}>{children}</div>
                {overlay}
            </section>
            {panel}
        </>
    )
}
