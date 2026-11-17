import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { UserRound } from 'lucide-react'

import { cn } from '@/lib/utils'

const Avatar = React.forwardRef<
    React.ElementRef<typeof AvatarPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
    <AvatarPrimitive.Root
        ref={ref}
        className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}
        {...props}
    />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
    React.ElementRef<typeof AvatarPrimitive.Image>,
    React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
    <AvatarPrimitive.Image ref={ref} className={cn('aspect-square h-full w-full', className)} {...props} />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
    React.ElementRef<typeof AvatarPrimitive.Fallback>,
    React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
    <AvatarPrimitive.Fallback
        ref={ref}
        className={cn('flex h-full w-full items-center justify-center rounded-full bg-muted', className)}
        {...props}
    />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

/**
 * What an avatar shows without a picture (00-components C-03): the first letter
 * of the name, or, with no name to show, the `deleted` variant: the default
 * person (an account others see as deleted, D-182). Goes in an AvatarFallback.
 */
function AvatarInitial({ name }: { name: string | null | undefined }) {
    // As the frame (`Avatar · deleted`): 20 on a 40 avatar, `text-tertiary`. Sized as an SVG
    // attribute: a size class would grow the initial CSS bundle (size-limit) for one icon.
    if (!name) return <UserRound size='50%' className='text-text-tertiary' aria-hidden='true' />
    return name.slice(0, 1).toUpperCase()
}

export { Avatar, AvatarImage, AvatarFallback, AvatarInitial }
