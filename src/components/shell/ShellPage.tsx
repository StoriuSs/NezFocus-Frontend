import { useContext, type ReactNode } from 'react'
import { Menu, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { SHELL_LIST_ID, SHELL_NAV_BUTTON_ID, ShellContext } from './shell-context'
import { IconButton } from '@/components/ui/icon-button'

/**
 * A page in the AppShell's content area: the 48-high Header (C-07) over a
 * scrolling body, and an optional right panel beside both (C-08).
 *
 * Header: ☰ below 1024 (opens the navigation), an optional icon, the title
 * (`headline` 600, cut with … when long), then the page's actions, which
 * always stay visible.
 */
export function ShellPage({
    title,
    icon: Icon,
    actions,
    panel,
    children,
    bodyClassName
}: {
    title: string
    icon?: LucideIcon
    actions?: ReactNode
    panel?: ReactNode
    children?: ReactNode
    bodyClassName?: string
}) {
    const { t } = useTranslation()
    const shell = useContext(ShellContext)

    return (
        <>
            <section className='flex min-w-0 flex-1 flex-col'>
                <header className='flex h-12 shrink-0 items-center gap-2 border-b px-4'>
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
                    {Icon ? <Icon className='size-5 shrink-0 text-text-tertiary' aria-hidden='true' /> : null}
                    <h1 className='min-w-0 flex-1 truncate text-headline text-text-primary' title={title}>
                        {title}
                    </h1>
                    {actions ? <div className='flex shrink-0 items-center gap-1'>{actions}</div> : null}
                </header>
                <div className={cn('min-h-0 flex-1 overflow-y-auto', bodyClassName)}>{children}</div>
            </section>
            {panel}
        </>
    )
}
