import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Loading fallback for lazy-loaded routes, centred in the space it is given.
 * Shown briefly while the route component is being downloaded.
 *
 * The default fills the window (before any layout is on screen). Inside a
 * layout, pass the area to fill: the AppShell's content area is one row of a
 * flex box, so it needs `flex-1` or the spinner sits at its left edge.
 */
export function PageLoader({ className }: { className?: string }) {
    return (
        <div className={cn('flex min-h-screen w-full items-center justify-center', className)}>
            <Loader2 className='h-8 w-8 animate-spin text-primary' aria-hidden='true' />
        </div>
    )
}
