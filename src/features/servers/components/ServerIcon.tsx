import { cn } from '@/lib/utils'
import { serverInitials } from '../lib/server-name'

/**
 * A server's picture (C-05 RailItem `server`): its icon, or the initials of
 * its name on `surface-2`. Rounded by the caller (`rounded-server` at 48).
 */
export function ServerIcon({
    name,
    iconUrl,
    className
}: {
    name: string
    iconUrl?: string | null
    className?: string
}) {
    if (iconUrl) return <img src={iconUrl} alt='' className={cn('object-cover', className)} />
    return (
        <span
            aria-hidden='true'
            className={cn(
                'flex items-center justify-center bg-surface-2 text-label font-semibold text-text-primary',
                className
            )}
        >
            {serverInitials(name)}
        </span>
    )
}
