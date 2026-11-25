import type { RefObject } from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import type { ProfilePopoverProps } from '@/features/users'
import { ProfileCard } from './ProfileCard'

/**
 * The profile popover (02 S-CHAT-05, C-15), connected to users'
 * `ProfileTrigger` by the AppShell and loaded the first time one opens
 * (D-253): 320 wide, padded 16, hanging from the avatar or name that opened
 * it (`anchor`), on `side`, turning at the window's edge. Esc or a click
 * outside closes it; a click on the opener is left to it (it toggles).
 */
export default function ProfilePopover({ anchor, side, open, onOpenChange, ...card }: ProfilePopoverProps) {
    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverAnchor virtualRef={anchor as RefObject<HTMLElement>} />
            <PopoverContent
                side={side}
                collisionPadding={8}
                aria-label={card.name}
                className='flex w-80 flex-col gap-3 p-4'
                onInteractOutside={(event) => {
                    if (anchor.current?.contains(event.target as Node)) event.preventDefault()
                }}
            >
                <ProfileCard {...card} />
            </PopoverContent>
        </Popover>
    )
}
