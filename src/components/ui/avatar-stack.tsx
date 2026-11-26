import { Avatar, AvatarFallback, AvatarImage, AvatarInitial } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export interface StackPerson {
    id: string
    displayName: string | null
    username: string | null
    avatarUrl: string | null
}

const SIZES = { 20: 'size-5', 22: 'size-[22px]', 24: 'size-6' } as const
const OVERLAP = { marginLeft: -6 }
const AFTER = { marginLeft: 6 }

/**
 * Avatars overlapping (C-03; C-28, C-44): at most `max`, then "+N". `me` first,
 * on `primary` (C-28 › Người được giao). Decorative: the row's label names
 * the people. Each ringed in the colour under it (`ring`): `surface-1` on a
 * task's row, `bg` on the Study pages' friends (C-44, 22).
 */
export function AvatarStack({
    people,
    me,
    max = 3,
    size = 20,
    ring = 'ring-surface-1',
    className
}: {
    people: readonly StackPerson[]
    me?: string
    max?: number
    size?: keyof typeof SIZES
    ring?: 'ring-surface-1' | 'ring-bg'
    className?: string
}) {
    const shown = people.slice(0, max)
    const more = people.length - shown.length
    return (
        <span aria-hidden='true' className={cn('flex shrink-0 items-center', className)}>
            <span className='flex items-center'>
                {shown.map((person, index) => (
                    <Avatar
                        key={person.id}
                        // Overlapping by 6 (C-03), inline: one value, no class in the main stylesheet for it.
                        style={index > 0 ? OVERLAP : undefined}
                        className={cn('shrink-0 ring-2', ring, SIZES[size])}
                    >
                        <AvatarImage src={person.avatarUrl ?? undefined} alt='' className='object-cover' />
                        <AvatarFallback
                            className={cn(
                                'text-micro font-semibold',
                                person.id === me ? 'bg-primary text-on-primary' : 'bg-surface-3 text-text-primary'
                            )}
                        >
                            <AvatarInitial name={person.displayName ?? person.username} />
                        </AvatarFallback>
                    </Avatar>
                ))}
            </span>
            {more > 0 ? (
                <span style={AFTER} className='text-label font-semibold text-text-secondary'>
                    +{more}
                </span>
            ) : null}
        </span>
    )
}
