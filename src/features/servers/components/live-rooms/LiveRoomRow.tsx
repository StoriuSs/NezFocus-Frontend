import { forwardRef, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { Tag } from '@/components/settings/SettingsRow'
import { AvatarStack } from '@/components/ui/avatar-stack'
import { sessionLineText, useListClock } from '@/features/study'
import { cn } from '@/lib/utils'
import { livePeopleText } from '../../lib/live-people'
import type { LiveRoom, StudyRow } from '../../lib/live-rooms'
import { channelPath } from '../../lib/paths'
import { ListPhase } from './ListPhase'

/**
 * A room studying now on the Study page (C-44 LiveRoomRow): its phase in
 * minutes ("Tập trung · còn 18 phút", again as each minute goes, also for
 * the room one is in: the dock counts the seconds), its name and "Bạn ở
 * đây", then up to three friends' avatars and "Bình, Chi và 6 người ·
 * {Server}" (`livePeopleText`: "Chỉ có bạn" alone in it), the server's name
 * cut first. The whole row is a link to the room (its preview
 * page, or the room one is in), handing it the session shown (`StudyRow`:
 * gone by the time the page opens, it says so, 08 › Edge); a chevron at its right. `leaving`: its
 * session ended, fading out (`useLiveRooms`: none with Giảm chuyển động). One Tab stop for
 * the list (`tabIndex`), ↑ ↓ handed to the list (`onKeyDown`).
 */
export const LiveRoomRow = forwardRef<
    HTMLAnchorElement,
    {
        room: LiveRoom
        leaving: boolean
        tabIndex: number
        onKeyDown: (event: KeyboardEvent) => void
        onFocus: () => void
    }
>(function LiveRoomRow({ room, leaving, tabIndex, onKeyDown, onFocus }, ref) {
    const { t } = useTranslation('study')
    const { t: tShell } = useTranslation()
    const now = useListClock(room.session)
    const people = livePeopleText(t, room)
    const label = t(room.here ? 'overview.rooms.labelHere' : 'overview.rooms.label', {
        room: room.name,
        server: room.serverName,
        phase: sessionLineText(tShell, room.session, now),
        people
    })
    return (
        <Link
            ref={ref}
            to={channelPath(room.serverId, room.channelId)}
            state={{ studyRow: { sessionId: room.session.id, name: room.name } satisfies StudyRow }}
            aria-label={label}
            tabIndex={leaving ? -1 : tabIndex}
            aria-hidden={leaving || undefined}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            className={cn(
                'group flex h-[84px] items-center gap-3 rounded-input p-3 transition-opacity duration-short hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                leaving && 'pointer-events-none opacity-0'
            )}
        >
            <span className='flex min-w-0 flex-1 flex-col'>
                <ListPhase phase={room.session} now={now} />
                <span className='flex min-w-0 items-center gap-2'>
                    <span className='truncate text-body font-semibold text-text-primary'>{room.name}</span>
                    {room.here ? <Tag>{t('overview.rooms.here')}</Tag> : null}
                </span>
                <span className='flex min-w-0 items-center gap-2 text-label text-text-secondary'>
                    {room.friends.length > 0 ? (
                        <AvatarStack people={room.friends.slice(0, 3)} size={22} ring='ring-bg' />
                    ) : null}
                    <span className='flex min-w-0'>
                        <span className='shrink-0 whitespace-pre'>{`${people} · `}</span>
                        <span className='truncate'>{room.serverName}</span>
                    </span>
                </span>
            </span>
            <ChevronRight
                className='size-4 shrink-0 text-text-tertiary group-hover:text-text-secondary'
                aria-hidden='true'
            />
        </Link>
    )
})
