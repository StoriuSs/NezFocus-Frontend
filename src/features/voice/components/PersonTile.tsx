import { Mic, MicOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import { cn } from '@/lib/utils'
import { personName } from '../lib/people'
import type { RoomPerson } from '../types'
import { PersonAvatar } from './PersonAvatar'

/**
 * A person in the room's grid (ParticipantTile `video`, C-20): 16:9,
 * `rounded.button`; no camera yet (L3b), so `camera-off`: `surface-2` with
 * their avatar 56 above the name strip. The strip (28, `scrim`): the name
 * (`label` 600, "You" for oneself, cut with …) and the mic. Speaking: a 2
 * `text-primary` rule around the tile (≤ 300 ms, VC-03), no blinking.
 */
export function PersonTile({
    person,
    self,
    micOn,
    speaking
}: {
    person: RoomPerson['user']
    self: boolean
    micOn: boolean
    speaking: boolean
}) {
    const { t } = useTranslation('voice')
    const name = self ? t('preview.you') : (personName(person) ?? t('person.deletedAccount'))
    const states = [micOn ? t('person.micOn') : t('person.micOff'), speaking && t('person.speaking')].filter(Boolean)
    return (
        <li
            aria-label={[name, ...states].join(', ')}
            className='relative flex aspect-video min-w-0 flex-col overflow-hidden rounded-button bg-surface-2'
        >
            <span className='flex min-h-0 flex-1 items-center justify-center'>
                <PersonAvatar person={person} className='size-14 text-headline' />
            </span>
            <span className='flex h-7 shrink-0 items-center gap-1.5 bg-scrim px-2 text-label font-semibold text-text-primary [&_svg]:size-3.5 [&_svg]:shrink-0'>
                <span className='min-w-0 flex-1 truncate'>{name}</span>
                {micOn ? <Mic aria-hidden='true' /> : <MicOff aria-hidden='true' />}
            </span>
            <span
                aria-hidden='true'
                className={cn(
                    'pointer-events-none absolute inset-0 rounded-button border-2 border-text-primary transition-opacity duration-micro',
                    speaking ? 'opacity-100' : 'opacity-0'
                )}
            />
        </li>
    )
}
