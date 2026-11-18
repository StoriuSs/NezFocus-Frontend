import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { Maximize2, Mic, MicOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import { cn } from '@/lib/utils'
import { personName } from '../lib/people'
import type { RoomPerson } from '../types'
import { PersonAvatar } from './PersonAvatar'

interface Shown {
    person: RoomPerson['user']
    self: boolean
    micOn: boolean
    speaking: boolean
    /** The camera's picture (a <video> the room page attaches the track to), when it sends one. */
    picture?: ReactNode
}

/**
 * How a camera's picture fills its tile: covering it, or whole (zoomed in);
 * one's own mirrored, as a mirror is (C-20 `self`). Inline: a class of its
 * own would weigh on the voice stylesheet (CONSTRAINTS.md, Voice CSS).
 */
export function pictureFit(self: boolean, whole = false): CSSProperties {
    return { objectFit: whole ? 'contain' : 'cover', ...(self ? { transform: 'scaleX(-1)' } : {}) }
}

/** The name a tile shows: "You" for oneself (C-20 `self`). */
export function useTileName(person: RoomPerson['user'], self: boolean): string {
    const { t } = useTranslation('voice')
    return self ? t('preview.you') : (personName(person) ?? t('person.deletedAccount'))
}

/**
 * What a tile shows (ParticipantTile `video`, C-20), in the grid or zoomed
 * in: the picture covering it, or `camera-off` (`surface-2` with the avatar
 * 56 above the name strip); the strip (28, `scrim`): the name (`label` 600,
 * cut with …) and the mic. Speaking: a 2 `text-primary` rule around it
 * (≤ 300 ms, VC-03), no blinking.
 */
export function TileFace({ person, self, micOn, speaking, picture }: Shown) {
    const name = useTileName(person, self)
    return (
        <>
            {picture ?? (
                <span className='flex min-h-0 flex-1 items-center justify-center'>
                    <PersonAvatar person={person} className='size-14 text-headline' />
                </span>
            )}
            <span className='relative mt-auto flex h-7 shrink-0 items-center gap-1.5 bg-scrim px-2 text-label font-semibold text-text-primary [&_svg]:size-3.5 [&_svg]:shrink-0'>
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
        </>
    )
}

/**
 * A person in the room's grid (C-20 › Lưới): 16:9, `rounded.button`, a
 * button in the list (as the attachment tray's tiles), so the keyboard
 * reaches it. One with a picture zooms in when pressed (a click, Enter,
 * Space; 07 câu L3b-b) and shows the zoom mark at its top right on hover or
 * focus (`maximize-2` in a 28 `scrim` square, 8 from the corner); one
 * without does nothing yet (the moderator's menu comes with L4). The grid is
 * one keyboard stop, ← → going between tiles (S-ROOM-06 › Tương tác): the
 * page sets `tabIndex`.
 */
export const PersonTile = forwardRef<
    HTMLButtonElement,
    Shown & { onZoom?: () => void } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>
>(({ person, self, micOn, speaking, picture, onZoom, ...props }, ref) => {
    const { t } = useTranslation('voice')
    const name = useTileName(person, self)
    const states = [
        micOn ? t('person.micOn') : t('person.micOff'),
        picture && t('person.cameraOn'),
        speaking && t('person.speaking'),
        picture && onZoom && t('person.zoomHint')
    ].filter(Boolean)
    return (
        <li className='flex min-w-0'>
            <button
                ref={ref}
                type='button'
                aria-label={[name, ...states].join(', ')}
                onClick={onZoom}
                className={cn(
                    'group relative flex aspect-video w-full min-w-0 flex-col overflow-hidden rounded-button bg-surface-2 text-left',
                    !onZoom && 'cursor-default'
                )}
                {...props}
            >
                <TileFace person={person} self={self} micOn={micOn} speaking={speaking} picture={picture} />
                {onZoom ? <Corner icon={<Maximize2 />} hidden /> : null}
            </button>
        </li>
    )
})

/** The zoom mark at a tile's top right (C-20 `hover`): 28 `scrim`, `rounded.input`, icon 14, 8 from the corner. */
export function Corner({ icon, hidden }: { icon: ReactNode; hidden?: boolean }) {
    return (
        <span
            aria-hidden='true'
            className={cn(
                'absolute right-2 top-2 flex aspect-square h-7 items-center justify-center rounded-input bg-scrim text-text-primary [&_svg]:size-3.5',
                hidden && 'opacity-0 transition-opacity duration-micro group-hover:opacity-100 group-focus:opacity-100'
            )}
        >
            {icon}
        </span>
    )
}
PersonTile.displayName = 'PersonTile'
