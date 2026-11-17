import { Avatar, AvatarFallback, AvatarImage, AvatarInitial } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export interface StackPerson {
    id: string
    displayName: string | null
    username: string | null
    avatarUrl: string | null
}

/**
 * Avatars overlapping (C-03, C-28): at most `max`, then "+N". `me` first,
 * on `primary` (C-28 › Người được giao). Decorative: the row's label names
 * the people.
 */
export function AvatarStack({
    people,
    me,
    max = 3,
    size = 20,
    className
}: {
    people: readonly StackPerson[]
    me?: string
    max?: number
    size?: 20 | 24
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
                        className={cn(
                            'shrink-0 ring-2 ring-surface-1',
                            size === 20 ? 'size-5' : 'size-6',
                            index > 0 && '-ml-1.5'
                        )}
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
            {more > 0 ? <span className='ml-1.5 text-label font-semibold text-text-secondary'>+{more}</span> : null}
        </span>
    )
}
