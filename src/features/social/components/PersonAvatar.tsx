import type { CSSProperties } from 'react'
import { UserRound } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage, AvatarInitial } from '@/components/ui/avatar'
import { PresenceDot } from '@/components/ui/presence-dot'
import { cn } from '@/lib/utils'
import { isGone } from '../lib/dm-chat'
import { nameOf } from '../lib/friends-list'
import type { Presence, SocialPerson } from '../types'

/**
 * Someone's avatar (C-03): their picture, else their initial; an account
 * deleted is the `deleted` avatar (`user-round` on `surface-2`), never a dot.
 * The dot only where it is given, cut out of the ground behind (`cutout`).
 */
export function PersonAvatar({
    person,
    presence,
    className,
    style,
    initialClassName,
    iconClassName = 'size-4',
    dot = 10,
    cutout = 'ring-bg',
    dotClassName = '-bottom-0.5 -right-0.5'
}: {
    person: SocialPerson
    presence?: Presence | null
    /** The size (`size-8`…). */
    className: string
    /** A one-off size kept inline (the profile popover's 56), out of the main stylesheet. */
    style?: CSSProperties
    /** The initial's type. */
    initialClassName: string
    /** The deleted avatar's icon, about half the avatar. */
    iconClassName?: string
    dot?: 8 | 10 | 14
    cutout?: string
    /** Where the dot sits on the avatar (further in on a large one, C-50). */
    dotClassName?: string
}) {
    const gone = isGone(person)
    return (
        <span className='relative shrink-0'>
            <Avatar className={className} style={style}>
                {gone ? null : <AvatarImage src={person.avatarUrl ?? undefined} alt='' className='object-cover' />}
                <AvatarFallback className={cn('bg-surface-3 font-semibold text-text-primary', initialClassName)}>
                    {gone ? (
                        <UserRound className={cn('text-text-secondary', iconClassName)} aria-hidden='true' />
                    ) : (
                        <AvatarInitial name={nameOf(person)} />
                    )}
                </AvatarFallback>
            </Avatar>
            {presence && !gone ? (
                <PresenceDot presence={presence} size={dot} cutout={cutout} className={cn('absolute', dotClassName)} />
            ) : null}
        </span>
    )
}
