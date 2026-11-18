import { useRef, useState } from 'react'
import { PhoneOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import { RoomContext, useIsSpeaking, useParticipants } from '@livekit/components-react'
import type { Participant, Room } from 'livekit-client'
import { useToastEdge } from '@/hooks/useToastArea'
import { useOrderedPeople } from '../hooks/useOrderedPeople'
import { useLeaveRoom } from '../hooks/useLeaveRoom'
import { gridOf } from '../lib/people'
import type { RoomPerson, VoiceRoom } from '../types'
import { MicControl } from './MicControl'
import { PersonTile } from './PersonTile'
import { RoomControl } from './RoomControl'

/**
 * The room once joined (S-ROOM-06 `voice`): every person a tile in the grid
 * (C-20 › Lưới, 07 P2: always the grid in a voice room), oneself first, then
 * as C-18 orders them; the controls at the bottom (Mic · Leave, 24 apart;
 * Camera and Share come with L3b and L5). Toasts sit 16 above the controls
 * (C-16).
 *
 * Who is there is LiveKit's: a person not yet on the API's list (its webhook
 * behind) still has a tile, with LiveKit's name; whether a mic is on is the
 * track's, and who speaks is LiveKit's (`useIsSpeaking`).
 */
export function InRoom({ room, live, me }: { room: VoiceRoom; live: Room; me: string }) {
    return (
        <RoomContext.Provider value={live}>
            <Stage room={room} me={me} />
        </RoomContext.Provider>
    )
}

function Stage({ room, me }: { room: VoiceRoom; me: string }) {
    const { t } = useTranslation('voice')
    const participants = useParticipants()
    const listed = new Map(room.people.map((person) => [person.user.id, person]))
    const people: RoomPerson[] = participants.map(
        (participant) =>
            listed.get(participant.identity) ?? {
                user: {
                    id: participant.identity,
                    username: null,
                    displayName: participant.name || null,
                    avatarUrl: null
                },
                joinedAt: new Date().toISOString(),
                micOn: participant.isMicrophoneEnabled,
                cameraOn: false,
                screenSharing: false,
                modMuted: false
            }
    )
    const ordered = useOrderedPeople(people, me)
    const byId = new Map(participants.map((participant) => [participant.identity, participant]))
    const { columns, maxWidth } = gridOf(ordered.length)
    const [helpOpen, setHelpOpen] = useState(false)
    const leave = useLeaveRoom(room)
    const bar = useRef<HTMLDivElement>(null)
    useToastEdge('barTop', bar)

    return (
        <div className='flex min-h-full flex-col'>
            <div className='flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-4'>
                <ul
                    aria-label={t('room.people')}
                    className='grid w-full justify-center gap-4'
                    style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, ${maxWidth}px))` }}
                >
                    {ordered.map((person) => (
                        <Tile
                            key={person.user.id}
                            person={person}
                            participant={byId.get(person.user.id)}
                            self={person.user.id === me}
                        />
                    ))}
                </ul>
            </div>
            <div ref={bar} className='flex shrink-0 items-start justify-center gap-4 px-6 pb-6 pt-2'>
                <MicControl canSpeak={room.canSpeak} helpOpen={helpOpen} onHelpOpenChange={setHelpOpen} />
                <span className='w-6' aria-hidden='true' />
                <RoomControl
                    icon={<PhoneOff />}
                    label={t('controls.leave')}
                    hint={t('controls.leave')}
                    onClick={leave}
                />
            </div>
        </div>
    )
}

function Tile({ person, participant, self }: { person: RoomPerson; participant?: Participant; self: boolean }) {
    const speaking = useIsSpeaking(participant)
    const micOn = participant ? participant.isMicrophoneEnabled : person.micOn
    return <PersonTile person={person.user} self={self} micOn={micOn} speaking={speaking} />
}
