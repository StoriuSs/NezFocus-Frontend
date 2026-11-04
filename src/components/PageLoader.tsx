import { Loader2 } from 'lucide-react'

/**
 * Loading fallback for lazy-loaded routes.
 * Shown briefly while the route component is being downloaded.
 */
export function PageLoader() {
    return (
        <div className='flex min-h-screen items-center justify-center'>
            <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
    )
}
