import type { ReactNode } from 'react'
import { Mic, MicOff, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import { WithTooltip } from '@/components/ui/tooltip'
import { ProfileTrigger } from '@/features/users'
import { personName } from '../lib/people'
import type { SeatFocus } from '../hooks/useSeatFocus'
import type { RoomPerson } from '../types'
import { PersonAvatar } from './PersonAvatar'

/**
 * A seat (ParticipantTile `seat`, C-20) on the preview page: avatar 48 in a
 * 56 frame; bottom right a mic for someone with theirs on (everyone joins
 * muted, D-43), or `mic-off` for someone a moderator muted (C-20: that one
 * first, 07 mod-muted), bottom left a camera. Hover: a Tooltip with the name (a screen reader reads
 * it, with the icons, from the seat's own label). Around a study room's ring
 * (C-18) it is no list item (`as='div'`): the ring's own name counts them.
 *
 * A click opens their profile in the room's server (07: "bấm ghế → Popover
 * hồ sơ", D-253): the seat is the button, named as the seat was; the seats
 * are one Tab stop, ← → between them (`focus`, `useSeatFocus`).
 */
export function Seat({
    person,
    serverId,
    focus,
    as: Tag = 'li'
}: {
    person: RoomPerson
    serverId: string
    focus: SeatFocus
    as?: 'li' | 'div'
}) {
    const { t } = useTranslation('voice')
    const name = personName(person.user) ?? t('person.deletedAccount')
    const states = [
        person.modMuted ? t('person.modMuted') : person.micOn && t('person.micOn'),
        person.cameraOn && t('person.cameraOn')
    ].filter(Boolean)
    return (
        <WithTooltip label={name}>
            <Tag data-seat={person.user.id} className='flex size-14'>
                <ProfileTrigger
                    userId={person.user.id}
                    serverId={serverId}
                    name={name}
                    avatarUrl={person.user.avatarUrl}
                    label={[name, ...states].join(', ')}
                    tabbable={focus.tabbable(person.user.id)}
                    onKeyDown={focus.onKeyDown(person.user.id)}
                    className='relative flex size-14 items-center justify-center rounded-full'
                >
                    <PersonAvatar person={person.user} className='size-12 text-body' />
                    {person.modMuted || person.micOn ? (
                        <Indicator className='bottom-0 right-0'>{person.modMuted ? <MicOff /> : <Mic />}</Indicator>
                    ) : null}
                    {person.cameraOn ? (
                        <Indicator className='bottom-0 left-0'>
                            <Video />
                        </Indicator>
                    ) : null}
                </ProfileTrigger>
            </Tag>
        </WithTooltip>
    )
}

function Indicator({ className, children }: { className: string; children: ReactNode }) {
    return (
        <span
            aria-hidden='true'
            className={`absolute flex size-5 items-center justify-center rounded-full border-2 border-bg bg-surface-3 text-text-primary [&_svg]:size-3 ${className}`}
        >
            {children}
        </span>
    )
}
