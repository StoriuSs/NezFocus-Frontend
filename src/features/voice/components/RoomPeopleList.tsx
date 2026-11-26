import { Mic, MicOff, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import '../voice.css'
import { ProfileTrigger } from '@/features/users'
import { orderPeople, personName } from '../lib/people'
import type { RoomPerson } from '../types'
import { PersonAvatar } from './PersonAvatar'

/**
 * Everyone in a room, in the order of its seats as the panel opened
 * (`order`; newcomers at the end, those gone left out; C-18, C-20 `list`, 07
 * `room-13-people`): the body of the panel "Người trong phòng" a "+N" seat
 * opens. Each row: avatar 32, the name ("Bạn" for oneself), "Đang điều
 * khiển" under the Host's, then the camera if on and the mic as it is
 * (`mic-off` when off or muted by a moderator). The row opens their
 * profile in the room's server (`serverId`), on the panel's left (D-253).
 */
export default function RoomPeopleList({
    people,
    me,
    hostId,
    order,
    serverId
}: {
    people: RoomPerson[]
    serverId: string
    me: string | undefined
    hostId: string | null
    order: readonly string[]
}) {
    const { t } = useTranslation('voice')
    const byId = new Map(people.map((person) => [person.user.id, person]))
    const ordered = orderPeople(people, me, order, hostId).flatMap((id) => byId.get(id) ?? [])
    return (
        <ul className='flex flex-col gap-1 py-1' aria-label={t('room.people')}>
            {ordered.map((person) => {
                const mine = person.user.id === me
                const name = mine ? t('panel.you') : (personName(person.user) ?? t('person.deletedAccount'))
                const micOn = person.micOn && !person.modMuted
                const states = [
                    person.user.id === hostId && t('panel.host'),
                    person.modMuted ? t('person.modMuted') : person.micOn ? t('person.micOn') : t('person.micOff'),
                    person.cameraOn && t('person.cameraOn')
                ].filter(Boolean)
                return (
                    <li key={person.user.id} className='rounded-button hover:bg-surface-2'>
                        <ProfileTrigger
                            userId={person.user.id}
                            serverId={serverId}
                            name={personName(person.user) ?? t('person.deletedAccount')}
                            avatarUrl={person.user.avatarUrl}
                            label={[name, ...states].join(', ')}
                            side='left'
                            className='flex w-full items-center gap-3 rounded-button px-2 py-1.5'
                        >
                            <PersonAvatar person={person.user} className='size-8 shrink-0 text-label' />
                            <span className='flex min-w-0 flex-1 flex-col' aria-hidden='true'>
                                <span className='truncate text-body-sm font-medium text-text-primary'>{name}</span>
                                {person.user.id === hostId ? (
                                    <span className='truncate text-label text-text-secondary'>{t('panel.host')}</span>
                                ) : null}
                            </span>
                            <span
                                className='flex shrink-0 items-center gap-2 text-text-secondary [&_svg]:size-4'
                                aria-hidden='true'
                            >
                                {person.cameraOn ? <Video /> : null}
                                {micOn ? <Mic /> : <MicOff />}
                            </span>
                        </ProfileTrigger>
                    </li>
                )
            })}
        </ul>
    )
}
