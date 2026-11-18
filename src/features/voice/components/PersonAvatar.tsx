import { Avatar, AvatarFallback, AvatarImage, AvatarInitial } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { RoomPerson } from '../types'

/** A person's picture or initial (C-03); an account deleted shows the default person (D-182). */
export function PersonAvatar({ person, className }: { person: RoomPerson['user']; className?: string }) {
    return (
        <Avatar className={className}>
            <AvatarImage src={person.avatarUrl ?? undefined} alt='' className='object-cover' />
            <AvatarFallback className={cn('bg-surface-3 font-semibold text-text-primary')}>
                <AvatarInitial name={person.displayName ?? person.username} />
            </AvatarFallback>
        </Avatar>
    )
}
