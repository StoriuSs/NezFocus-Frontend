import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { EllipsisVertical } from 'lucide-react'
import '@/i18n/social'
import { Avatar, AvatarFallback, AvatarImage, AvatarInitial } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'
import { PresenceDot } from '@/components/ui/presence-dot'
import { WithTooltip } from '@/components/ui/tooltip'
import { nameOf } from '../lib/friends-list'
import type { Relationship } from '../types'

export interface FriendRowActions {
    onAccept: (entry: Relationship) => void
    onDecline: (entry: Relationship) => void
    onCancel: (entry: Relationship) => void
    onUnblock: (entry: Relationship) => void
    onUnfriend: (entry: Relationship) => void
    onBlock: (entry: Relationship) => void
}

/**
 * FriendRow (C-30): avatar 40 with a friend's dot, the name (`body` 600)
 * and the username, the second line, and the actions, always shown (09 Q7):
 * a friend's ⋯ (Remove friend · Block); a request to me Accept / Decline;
 * mine Cancel request with its time column; someone blocked Unblock.
 * "Message" and the calls of ⋯ come with the DM and the calls (D-248).
 * Offline, the actions are off with "You need a connection" (S-DM-02).
 * Rows are 60 high, a `border` line between them, gone around the row
 * hovered.
 */
export function FriendRow({
    entry,
    time,
    offline,
    actions
}: {
    entry: Relationship
    /** The time column of a request (FriendRow/pending, D-110): "19:48", "Hôm qua"… */
    time?: string
    offline: boolean
    actions: FriendRowActions
}) {
    const { t } = useTranslation('social')
    const name = nameOf(entry.user)
    const shownName = name ?? t('friends.deleted')

    return (
        <li className='flex h-[60px] items-center gap-3 rounded-input border-t px-3 first:border-t-0 hover:border-transparent hover:bg-surface-2 [&:hover+li]:border-transparent'>
            <span className='relative shrink-0'>
                <Avatar className='size-10'>
                    <AvatarImage src={entry.user.avatarUrl ?? undefined} alt='' className='object-cover' />
                    <AvatarFallback className='bg-surface-3 text-body font-semibold text-text-primary'>
                        <AvatarInitial name={name} />
                    </AvatarFallback>
                </Avatar>
                {entry.type === 'friend' && entry.presence ? (
                    <PresenceDot
                        presence={entry.presence}
                        cutout='ring-bg'
                        className='absolute -bottom-0.5 -right-0.5'
                    />
                ) : null}
            </span>
            <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                {/* Short of room, the username goes first (D-108): it shrinks 999 times faster than the name. */}
                <span className='flex min-w-0 items-center gap-2'>
                    <span className='min-w-0 truncate text-body font-semibold text-text-primary'>{shownName}</span>
                    {entry.user.username && entry.user.displayName ? (
                        <span style={{ flexShrink: 999 }} className='min-w-0 truncate text-label text-text-tertiary'>
                            {entry.user.username}
                        </span>
                    ) : null}
                </span>
                <SecondLine entry={entry} />
            </span>
            {time === undefined ? null : (
                <span className='w-[84px] shrink-0 text-right text-label text-text-tertiary'>{time}</span>
            )}
            <span className='flex shrink-0 items-center gap-2'>
                <Actions entry={entry} name={shownName} offline={offline} actions={actions} />
            </span>
        </li>
    )
}

/** The second line (C-30): the presence in words, the note of a request, or "Blocked". */
function SecondLine({ entry }: { entry: Relationship }) {
    const { t } = useTranslation('social')
    if (entry.type === 'incoming' || entry.type === 'outgoing') {
        return entry.note ? (
            <span className='truncate text-label text-text-secondary' title={entry.note}>
                {t('friends.note', { note: entry.note })}
            </span>
        ) : (
            <span className='truncate text-label text-text-tertiary'>{t('friends.noNote')}</span>
        )
    }
    const line =
        entry.type === 'blocked' ? t('friends.blockedLine') : t(`friends.presence.${entry.presence ?? 'offline'}`)
    return <span className='truncate text-label text-text-secondary'>{line}</span>
}

/** One action, off with its Tooltip while offline (the Tooltip needs a live element around it, as the inbox's ✓). */
function Gated({ offline, children }: { offline: boolean; children: ReactNode }) {
    const { t } = useTranslation('social')
    if (!offline) return <>{children}</>
    return (
        <WithTooltip label={t('friends.offline')}>
            <span>{children}</span>
        </WithTooltip>
    )
}

function Actions({
    entry,
    name,
    offline,
    actions
}: {
    entry: Relationship
    name: string
    offline: boolean
    actions: FriendRowActions
}) {
    const { t } = useTranslation('social')
    switch (entry.type) {
        case 'incoming':
            return (
                <>
                    <Gated offline={offline}>
                        <Button size='sm' disabled={offline} onClick={() => actions.onAccept(entry)}>
                            {t('friends.accept')}
                        </Button>
                    </Gated>
                    <Gated offline={offline}>
                        <Button
                            size='sm'
                            variant='secondary'
                            disabled={offline}
                            onClick={() => actions.onDecline(entry)}
                        >
                            {t('friends.decline')}
                        </Button>
                    </Gated>
                </>
            )
        case 'outgoing':
            return (
                <Gated offline={offline}>
                    <Button size='sm' variant='text' disabled={offline} onClick={() => actions.onCancel(entry)}>
                        {t('friends.cancel')}
                    </Button>
                </Gated>
            )
        case 'blocked':
            return (
                <Gated offline={offline}>
                    <Button size='sm' variant='secondary' disabled={offline} onClick={() => actions.onUnblock(entry)}>
                        {t('friends.unblock')}
                    </Button>
                </Gated>
            )
        case 'friend':
            return (
                <DropdownMenu>
                    <WithTooltip label={t('friends.more')}>
                        <DropdownMenuTrigger asChild>
                            <IconButton
                                label={`${t('friends.more')}: ${name}`}
                                className='size-9 rounded-full bg-surface-2 hover:bg-surface-3'
                            >
                                <EllipsisVertical />
                            </IconButton>
                        </DropdownMenuTrigger>
                    </WithTooltip>
                    <DropdownMenuContent align='end'>
                        <DropdownMenuItem disabled={offline} onSelect={() => actions.onUnfriend(entry)}>
                            {t('friends.unfriend')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            disabled={offline}
                            onSelect={() => actions.onBlock(entry)}
                            className='text-danger focus:text-danger'
                        >
                            {t('friends.block')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        default:
            return null
    }
}
