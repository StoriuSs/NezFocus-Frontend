import { Link } from 'react-router-dom'
import { Mic, MicOff, MonitorUp, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarFallback, AvatarImage, AvatarInitial } from '@/components/ui/avatar'
import { ProfileTrigger, useProfile } from '@/features/users'
import {
    LISTED_PEOPLE,
    ModeratorMenu,
    personName,
    roomActionsOn,
    useOrderedPeople,
    useRoomMenu,
    type RoomPerson,
    type VoiceRoom
} from '@/features/voice'
import { cn } from '@/lib/utils'

/** A moderator's ⋯ at the end of a person's row (ROOM-EDGE `mod-menu-row`): shown on hover or focus, as the room's ⚙. */
const ROW_MORE =
    'size-5 text-text-tertiary opacity-0 hover:bg-surface-3 hover:text-text-primary focus-visible:opacity-100 group-focus-within/person:opacity-100 group-hover/person:opacity-100 [&_svg]:size-3.5'
/** What someone has on (sharing · camera · mic): 14, `text-tertiary`. */
const STATE = 'size-3.5 shrink-0 text-text-tertiary'
/** The menu hangs from the foot of that ⋯ (the row 28 high, ⋯ 8 from its right edge). */
const ROW_MORE_FOOT = { right: 8, top: 24 }

/**
 * Who is in a voice room, under its row in the channel list (C-06 `occupied`,
 * D-205): avatar 20, the name (`label` 500 `text-secondary`), then what they
 * have on, in a fixed order: sharing · camera · mic (`text-tertiary` 14);
 * muted by a moderator, `mic-off` in the mic's place (C-20: `mod-muted`
 * first). Oneself first, then as C-06 orders them; up to 10, then "+N more",
 * which opens the room's page (not unfolded in place).
 */
export function RoomPeople({ room, to }: { room: VoiceRoom; to: string }) {
    const { t } = useTranslation()
    const ordered = useOrderedPeople(room.people, useProfile().data?.id, undefined, room.friends)
    const shown = ordered.slice(0, LISTED_PEOPLE)
    const more = ordered.length - shown.length
    return (
        <ul className='flex flex-col'>
            {shown.map((person) => (
                <PersonRow key={person.user.id} room={room} person={person} />
            ))}
            {more > 0 ? (
                <li>
                    <Link
                        to={to}
                        className='flex h-7 items-center rounded-input pl-[30px] pr-2 text-label font-medium text-text-tertiary hover:bg-surface-2 hover:text-text-secondary'
                    >
                        {t('shell.voice.morePeople', { count: more })}
                    </Link>
                </li>
            ) : null}
        </ul>
    )
}

/**
 * One person's row: what shows of them (avatar, name, what they have on) is
 * the button opening their profile in the room's server (D-253, L8b2-b); a
 * moderator gets a menu on it too (D-208, ROOM-EDGE `mod-menu-row`): ⋯ at
 * its end (a Tab stop of its own, beside the button), or a right click on
 * the row.
 */
function PersonRow({ room, person }: { room: VoiceRoom; person: RoomPerson }) {
    const { t } = useTranslation()
    const { user, micOn, cameraOn, screenSharing, modMuted } = person
    const actions = roomActionsOn(room, person, useProfile().data?.id)
    const menu = useRoomMenu(actions.length > 0)
    const name = personName(user) ?? t('shell.voice.deletedAccount')
    const states = [
        screenSharing && t('shell.voice.sharing'),
        cameraOn && t('shell.voice.cameraOn'),
        modMuted ? t('shell.voice.modMuted') : micOn && t('shell.voice.micOn')
    ].filter(Boolean)
    return (
        <li
            onContextMenu={menu.onContextMenu}
            className={cn(
                'group/person relative flex h-7 items-center gap-2 rounded-input pr-2 text-label font-medium text-text-secondary hover:bg-surface-2',
                menu.open && 'bg-surface-2'
            )}
        >
            <ProfileTrigger
                userId={user.id}
                serverId={room.serverId}
                name={name}
                avatarUrl={user.avatarUrl}
                label={[name, ...states].join(', ')}
                className='flex h-full min-w-0 flex-1 items-center gap-2 rounded-input pl-[30px]'
            >
                <Avatar className='size-5'>
                    <AvatarImage src={user.avatarUrl ?? undefined} alt='' className='object-cover' />
                    <AvatarFallback className='bg-surface-3 text-micro font-semibold text-text-primary'>
                        <AvatarInitial name={user.displayName ?? user.username} />
                    </AvatarFallback>
                </Avatar>
                <span className='min-w-0 flex-1 truncate' aria-hidden='true'>
                    {name}
                </span>
                {screenSharing ? <MonitorUp className={STATE} aria-hidden='true' /> : null}
                {cameraOn ? <Video className={STATE} aria-hidden='true' /> : null}
                {modMuted ? (
                    <MicOff className={STATE} aria-hidden='true' />
                ) : micOn ? (
                    <Mic className={STATE} aria-hidden='true' />
                ) : null}
            </ProfileTrigger>
            <ModeratorMenu
                menu={menu}
                channelId={room.channelId}
                userId={user.id}
                name={name}
                actions={actions}
                className={ROW_MORE}
                foot={ROW_MORE_FOOT}
                tabbable
            />
        </li>
    )
}
