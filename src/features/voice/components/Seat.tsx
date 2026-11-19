import type { ReactNode } from 'react'
import { Mic, MicOff, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import { WithTooltip } from '@/components/ui/tooltip'
import { personName } from '../lib/people'
import type { RoomPerson } from '../types'
import { PersonAvatar } from './PersonAvatar'

/**
 * A seat (ParticipantTile `seat`, C-20) on the preview page: avatar 48 in a
 * 56 frame; bottom right a mic for someone with theirs on (everyone joins
 * muted, D-43), or `mic-off` for someone a moderator muted (C-20: that one
 * first, 07 mod-muted), bottom left a camera. Hover: a Tooltip with the name (a screen reader reads
 * it, with the icons, from the seat's own label).
 */
export function Seat({ person }: { person: RoomPerson }) {
    const { t } = useTranslation('voice')
    const name = personName(person.user) ?? t('person.deletedAccount')
    const states = [
        person.modMuted ? t('person.modMuted') : person.micOn && t('person.micOn'),
        person.cameraOn && t('person.cameraOn')
    ].filter(Boolean)
    return (
        <WithTooltip label={name}>
            <li
                aria-label={[name, ...states].join(', ')}
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
            </li>
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
