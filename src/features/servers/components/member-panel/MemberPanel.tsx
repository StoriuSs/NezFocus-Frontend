import { useId, type ReactNode } from 'react'
import { Crown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarFallback, AvatarImage, AvatarInitial } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { PresenceDot } from '@/components/ui/presence-dot'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useMemberPanel } from '../../api/useMemberPanel'
import { useWhenSeen } from '../../hooks/useWhenSeen'
import { useMemberName } from '../../hooks/useMemberName'
import type { ServerMember } from '../../types'

/**
 * A row of MemberRow/panel (C-13): 44 high, 10 between avatar and name.
 * Inline: one-off sizes, not worth two classes in the main stylesheet.
 */
const ROW = { height: 44, gap: 10 }

/**
 * The Members panel of a server (S-SHELL-01, C-13 `MemberRow/panel`):
 * "ONLINE — N" then "OFFLINE — N", each by name, the counts the server's
 * (D-175). The offline group loads 100 more as its end comes into view.
 * What others see of each member, and of oneself: someone invisible is in
 * OFFLINE (S-ME-01 › Tương tác). Opening a profile comes with S-CHAT-05.
 */
export function MemberPanel({ serverId }: { serverId: string }) {
    const { t } = useTranslation()
    const { online, offline } = useMemberPanel(serverId)

    if (online.isPending || offline.isPending) {
        return (
            <div aria-busy='true' className='grid gap-1'>
                <p role='status' className='sr-only'>
                    {t('shell.members.loading')}
                </p>
                {[0, 1, 2, 3].map((index) => (
                    <div key={index} style={ROW} className='flex items-center px-2'>
                        <Skeleton className='size-8 rounded-full' />
                        <Skeleton className='h-3 w-28' />
                    </div>
                ))}
            </div>
        )
    }
    // A failed first reading; a page that failed after it keeps what was read (below).
    if (online.data === undefined || offline.data === undefined) {
        return (
            <div className='flex flex-col items-center gap-3 px-2 py-8 text-center'>
                <p className='text-body-sm text-text-secondary'>{t('shell.members.failed')}</p>
                <Button
                    variant='secondary'
                    onClick={() => {
                        void online.refetch()
                        void offline.refetch()
                    }}
                >
                    {t('buttons.tryAgain')}
                </Button>
            </div>
        )
    }

    const away = offline.data.pages.flatMap((page) => page.items)
    const awayTotal = offline.data.pages[0]?.meta.totalItems ?? 0
    // One column no wider than the panel: an auto column would grow to the longest name, past "…" (C-13).
    return (
        <div className='grid grid-cols-1 gap-4'>
            <Group title={t('shell.members.online', { count: online.data.total })} members={online.data.items} />
            {awayTotal > 0 ? (
                <Group title={t('shell.members.offline', { count: awayTotal })} members={away} offline>
                    {offline.isFetchNextPageError ? (
                        <div className='flex justify-center py-2'>
                            <Button variant='secondary' onClick={() => void offline.fetchNextPage()}>
                                {t('buttons.tryAgain')}
                            </Button>
                        </div>
                    ) : offline.hasNextPage ? (
                        <LoadMore
                            key={offline.data.pages.length}
                            onSeen={() => !offline.isFetchingNextPage && void offline.fetchNextPage()}
                        />
                    ) : null}
                </Group>
            ) : null}
        </div>
    )
}

function Group({
    title,
    members,
    offline = false,
    children
}: {
    title: string
    members: ServerMember[]
    offline?: boolean
    children?: ReactNode
}) {
    const id = useId()
    return (
        <section aria-labelledby={id}>
            <h3 id={id} className='px-2 pb-1 text-label font-semibold uppercase text-text-tertiary'>
                {title}
            </h3>
            <ul>
                {members.map((member) => (
                    <MemberRow key={member.userId} member={member} offline={offline} />
                ))}
            </ul>
            {children}
        </section>
    )
}

/** MemberRow/panel (C-13): avatar 32 with its dot, name and username; the owner's crown at the end. */
function MemberRow({ member, offline }: { member: ServerMember; offline: boolean }) {
    const { t } = useTranslation()
    const name = useMemberName()(member)
    return (
        <li style={ROW} className='flex items-center rounded-input px-2 hover:bg-surface-2'>
            <span className='relative shrink-0'>
                <Avatar className='size-8'>
                    <AvatarImage src={member.avatarUrl ?? undefined} alt='' className='object-cover' />
                    <AvatarFallback className='bg-surface-3 text-label font-semibold text-text-primary'>
                        <AvatarInitial name={member.displayName ?? member.username} />
                    </AvatarFallback>
                </Avatar>
                <PresenceDot
                    presence={member.status}
                    cutout='ring-surface-1'
                    className='absolute -bottom-0.5 -right-0.5'
                />
            </span>
            {/* Short of room, the username goes first (D-108): it shrinks 999 times faster than the name. */}
            <span className='flex min-w-0 flex-1 items-center gap-1.5'>
                <span
                    className={cn(
                        'min-w-0 truncate text-body-sm font-medium',
                        offline ? 'text-text-tertiary' : 'text-text-secondary'
                    )}
                >
                    {name}
                </span>
                {member.username && member.displayName ? (
                    <span style={{ flexShrink: 999 }} className='min-w-0 truncate text-label text-text-tertiary'>
                        {member.username}
                    </span>
                ) : null}
            </span>
            {member.isOwner ? (
                <>
                    <Crown className='size-3.5 shrink-0 text-text-tertiary' aria-hidden='true' />
                    <span className='sr-only'>{t('shell.members.owner')}</span>
                </>
            ) : null}
        </li>
    )
}

/** Asks for the next page once it comes into view; one per page (`key`), so one still in view asks again. */
function LoadMore({ onSeen }: { onSeen: () => void }) {
    const spot = useWhenSeen(onSeen)
    return <div ref={spot} style={{ height: ROW.height }} aria-hidden='true' />
}
