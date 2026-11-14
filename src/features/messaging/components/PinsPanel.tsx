import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, PinOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { IconButton } from '@/components/ui/icon-button'
import { Skeleton } from '@/components/ui/skeleton'
import { settingsCache } from '@/features/users'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { cn } from '@/lib/utils'
import { usePinMessage } from '../api/usePinMessage'
import { usePins } from '../api/usePins'
import { plainText } from '../lib/markdown'
import { messageTime } from '../lib/message-time'
import type { PinnedMessage } from '../types'

/**
 * The pins of a channel (S-CHAT-02), inside the servers feature's
 * RightPanel: the latest pinned first, each a card (C-10 `pinned`: avatar
 * 24, name and when it was sent, at most 3 lines) that opens its message,
 * lit up. ↑ / ↓ move between the cards, Enter opens one. With
 * MANAGE_MESSAGES, ⋯ on a card's top right (on hover or focus) unpins it:
 * it leaves at once, with "Unpinned", focus on the card after it (or before
 * it, or the panel once none is left). Three Skeleton cards while it loads;
 * "No pinned messages yet" when there are none.
 */
export function PinsPanel({
    channelId,
    manage,
    onOpen
}: {
    channelId: string
    /** MANAGE_MESSAGES: unpin from the card. */
    manage: boolean
    /** Opens the message in the chat (its link, as a message link opens). */
    onOpen: (messageId: string) => void
}) {
    const { t } = useTranslation('messaging')
    const pins = usePins(channelId)
    const { unpin } = usePinMessage(channelId)
    const timeZone = useQuery(settingsCache).data?.timezone
    const now = useMinuteClock()
    const root = useRef<HTMLDivElement>(null)
    /** Where focus goes once the card being unpinned has left: a card's id, or the panel (null). */
    const focusNext = useRef<{ unpinned: string; next: string | null } | null>(null)
    const ids = pins.data?.map((pin) => pin.id).join(' ')
    useEffect(() => {
        const after = focusNext.current
        if (!after || pins.data?.some((pin) => pin.id === after.unpinned)) return
        focusNext.current = null
        const card = after.next && root.current?.querySelector<HTMLElement>(`[data-pin-card="${after.next}"]`)
        ;(card || root.current)?.focus()
    }, [ids, pins.data])
    const unpinFrom = (id: string) => {
        const list = pins.data ?? []
        const at = list.findIndex((pin) => pin.id === id)
        focusNext.current = { unpinned: id, next: (list[at + 1] ?? list[at - 1])?.id ?? null }
        unpin(id)
    }

    if (pins.isPending) {
        return (
            <div aria-busy='true'>
                <p role='status' className='sr-only'>
                    {t('pins.loading')}
                </p>
                {[0, 1, 2].map((index) => (
                    <div key={index} className='flex flex-col gap-2 p-2'>
                        <div className='flex items-center gap-2'>
                            <Skeleton className='size-6 rounded-full' />
                            <Skeleton className='h-3 w-24' />
                        </div>
                        <Skeleton className='h-3 w-full' />
                        <Skeleton className='h-3 w-48' />
                    </div>
                ))}
            </div>
        )
    }
    if (pins.isError) {
        return (
            <div className='flex flex-col items-center gap-3 px-2 py-8 text-center'>
                <p className='text-body-sm text-text-secondary'>{t('pins.loadError')}</p>
                <Button variant='secondary' onClick={() => void pins.refetch()}>
                    {t('pins.retry')}
                </Button>
            </div>
        )
    }
    if (!pins.data.length) {
        return (
            <div ref={root} tabIndex={-1} className='flex justify-center px-2 pt-8 focus:outline-none'>
                <EmptyState size='inline' title={t('pins.emptyTitle')}>
                    {t('pins.emptyBody')}
                </EmptyState>
            </div>
        )
    }

    // ↑ / ↓ between the cards' buttons.
    const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        const list = event.currentTarget.closest('ul')
        const cards = [...(list?.querySelectorAll<HTMLElement>('[data-pin-card]') ?? [])]
        const from = cards.indexOf(event.currentTarget)
        if (from === -1) return
        const next = cards[from + (event.key === 'ArrowUp' ? -1 : 1)]
        if (!next) return
        event.preventDefault()
        next.focus()
    }

    return (
        <div ref={root} tabIndex={-1} className='focus:outline-none'>
            <ul className='flex flex-col gap-1'>
                {pins.data.map((pin) => (
                    <PinCard
                        key={pin.id}
                        pin={pin}
                        time={messageTime(new Date(pin.createdAt), now, timeZone, t)}
                        manage={manage}
                        onOpen={() => onOpen(pin.id)}
                        onUnpin={() => unpinFrom(pin.id)}
                        onKeyDown={keyDown}
                    />
                ))}
            </ul>
        </div>
    )
}

function PinCard({
    pin,
    time,
    manage,
    onOpen,
    onUnpin,
    onKeyDown
}: {
    pin: PinnedMessage
    time: string
    manage: boolean
    onOpen: () => void
    onUnpin: () => void
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
    const { t } = useTranslation('messaging')
    const [menuOpen, setMenuOpen] = useState(false)
    const name = pin.author?.displayName ?? pin.author?.username ?? t('message.deletedAccount')
    const content = plainText(pin.content)

    return (
        <li className='group relative'>
            <button
                type='button'
                data-pin-card={pin.id}
                onClick={onOpen}
                onKeyDown={onKeyDown}
                aria-label={t('pins.card', { name, time, content })}
                className={cn(
                    'flex w-full gap-2 rounded-button p-2 text-left hover:bg-surface-2',
                    menuOpen && 'bg-surface-2'
                )}
            >
                <Avatar className='size-6 shrink-0'>
                    <AvatarImage src={pin.author?.avatarUrl ?? undefined} alt='' className='object-cover' />
                    <AvatarFallback className='bg-surface-3 text-micro font-semibold text-text-primary'>
                        {name.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                    <span className='flex min-w-0 items-center gap-2 pr-8'>
                        <span className='truncate text-body-sm font-semibold text-text-primary'>{name}</span>
                        <span className='shrink-0 text-label font-medium text-text-tertiary'>{time}</span>
                    </span>
                    <span className='line-clamp-3 break-words text-body-sm text-text-primary'>{content}</span>
                </span>
            </button>
            {manage ? (
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                    <DropdownMenuTrigger asChild>
                        <IconButton
                            label={t('pins.more')}
                            className={cn(
                                'absolute right-1 top-1 size-7 [&_svg]:size-4',
                                menuOpen ? '' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
                            )}
                        >
                            <MoreHorizontal aria-hidden='true' />
                        </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end' className='w-48'>
                        <DropdownMenuItem onSelect={onUnpin}>
                            <PinOff aria-hidden='true' />
                            {t('actions.unpin')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}
        </li>
    )
}
