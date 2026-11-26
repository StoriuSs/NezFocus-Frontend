import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { AvatarStack } from '@/components/ui/avatar-stack'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { nameOf, PersonAvatar } from '@/features/social'
import { sessionLineText, useListClock } from '@/features/study'
import { useFriendsStudying } from '../../hooks/useFriendsStudying'
import { keptFriends, type StudyingFriend } from '../../lib/friends-studying'
import type { StudyRow } from '../../lib/live-rooms'
import { channelPath } from '../../lib/paths'
import { ListPhase } from './ListPhase'

const ROW = 'flex items-center rounded-input'
// One-offs of the frame (C-44 `friend`: 76 high, padding 10 12, gap 10), inline: the main stylesheet keeps no class for them.
const ROW_STYLE = { height: 76, padding: '10px 12px', gap: 10 }
// Six rows and their gaps, the head (28) and the gap under it, the padding and the border (C-44 `friend`):
// then a scroll; less when the room above the line is less.
const MOST = 6 * 76 + 5 * 4 + 28 + 4 + 2 * 16 + 2
const POPOVER = { width: 400, maxHeight: `min(${MOST}px, var(--radix-popover-content-available-height))` }
// Its top 16 below the page's Header (48), never over it (08 edge `many-friends`); 16 from the other edges.
const ROOM = { top: 48 + 16, right: 16, bottom: 16, left: 16 }

/**
 * "2 bạn đang học lúc này" under the Solo page's ring (08 S-STUDY-02, R2,
 * R7): up to three friends' avatars, how many friends study now
 * (`useFriendsStudying`: in a room's session one sees, or on a Solo they
 * show), a chevron; none, no line. It opens "Bạn bè đang học" above it, 400
 * wide, its rows as they were when it opened (R2, D-254: the minutes move,
 * someone who stopped goes, a newcomer comes last), six rows then a scroll;
 * a row of a room is a link to its page, handing it the session shown as a
 * Study page row does; a Solo's row is no link (C-44 `friend · solo`). Esc
 * or a click outside closes it, the focus back on the line.
 */
export default function FriendsStudying() {
    const { t } = useTranslation('study')
    const friends = useFriendsStudying()
    const [held, setHeld] = useState<string[] | null>(null)
    // No one studying any more: no line, no popover.
    if (held && friends.length === 0) setHeld(null)
    if (friends.length === 0) return null
    const shown = held ? keptFriends(held, friends) : friends
    return (
        <Popover open={held !== null} onOpenChange={(open) => setHeld(open ? friends.map((one) => one.user.id) : null)}>
            <PopoverTrigger asChild>
                <button
                    type='button'
                    className='flex items-center gap-2 rounded-input px-1 text-label text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                >
                    <AvatarStack people={friends.slice(0, 3).map((one) => one.user)} size={22} ring='ring-bg' />
                    {t('friends.line', { count: friends.length })}
                    <ChevronRight className='size-3.5 shrink-0' aria-hidden='true' />
                </button>
            </PopoverTrigger>
            <PopoverContent
                side='top'
                align='center'
                collisionPadding={ROOM}
                aria-label={t('friends.title')}
                style={POPOVER}
                className='flex flex-col gap-1 p-4'
            >
                <div className='flex items-center justify-between gap-2 pb-1'>
                    <h2 className='text-headline font-semibold text-text-primary'>{t('friends.title')}</h2>
                    <span className='text-label text-text-tertiary'>{t('friends.count', { count: shown.length })}</span>
                </div>
                <ul className='flex min-h-0 flex-col gap-1 overflow-y-auto'>
                    {shown.map((friend) => (
                        <li key={friend.user.id}>
                            {friend.kind === 'room' ? <RoomRow friend={friend} /> : <SoloRow friend={friend} />}
                        </li>
                    ))}
                </ul>
            </PopoverContent>
        </Popover>
    )
}

/** A friend in a room's session: their name, "{Phòng} · {Server}", the phase; a link to the room. */
function RoomRow({ friend }: { friend: Extract<StudyingFriend, { kind: 'room' }> }) {
    const { t } = useTranslation('study')
    const { t: tShell } = useTranslation()
    const { room } = friend
    const now = useListClock(room.session)
    const name = nameOf(friend.user) ?? ''
    return (
        <Link
            to={channelPath(room.serverId, room.channelId)}
            state={{ studyRow: { sessionId: room.session.id, name: room.name } satisfies StudyRow }}
            aria-label={t('friends.roomLabel', {
                name,
                room: room.name,
                server: room.serverName,
                phase: sessionLineText(tShell, room.session, now)
            })}
            style={ROW_STYLE}
            className={`group ${ROW} hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
            <PersonAvatar person={friend.user} className='size-8 shrink-0' initialClassName='text-label' />
            <span className='flex min-w-0 flex-1 flex-col'>
                <span className='truncate text-body-sm font-semibold text-text-primary'>{name}</span>
                <span className='truncate text-label text-text-secondary'>{`${room.name} · ${room.serverName}`}</span>
                <ListPhase phase={room.session} now={now} />
            </span>
            <ChevronRight
                className='size-4 shrink-0 text-text-tertiary group-hover:text-text-secondary'
                aria-hidden='true'
            />
        </Link>
    )
}

/** A friend on a Solo: their name, "Đang học một mình", the phase; nothing to open (C-44 `friend · solo`). */
function SoloRow({ friend }: { friend: Extract<StudyingFriend, { kind: 'solo' }> }) {
    const { t } = useTranslation('study')
    const now = useListClock(friend.phase)
    return (
        <div style={ROW_STYLE} className={ROW}>
            <PersonAvatar person={friend.user} className='size-8 shrink-0' initialClassName='text-label' />
            <span className='flex min-w-0 flex-1 flex-col'>
                <span className='truncate text-body-sm font-semibold text-text-primary'>
                    {nameOf(friend.user) ?? ''}
                </span>
                <span className='truncate text-label text-text-secondary'>{t('friends.solo')}</span>
                <ListPhase phase={friend.phase} now={now} />
            </span>
        </div>
    )
}
