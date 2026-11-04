import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton loader that matches the Profile page layout.
 * Display this while profile data is loading.
 */
export function ProfileSkeleton() {
    return (
        <div className='container mx-auto py-10'>
            <div className='grid gap-6'>
                {/* Backend Profile Card Skeleton */}
                <div className='rounded-lg border bg-card text-card-foreground shadow-sm'>
                    <div className='flex flex-row items-center justify-between space-y-0 p-6'>
                        <div className='flex flex-col space-y-1.5'>
                            <Skeleton className='h-6 w-48' />
                            <Skeleton className='h-4 w-64 mt-1' />
                        </div>
                        <Skeleton className='h-9 w-20' />
                    </div>

                    <div className='p-6 pt-0 space-y-4'>
                        <div className='flex items-center gap-4'>
                            <Skeleton className='h-20 w-20 rounded-full' />
                            <div>
                                <Skeleton className='h-5 w-32' />
                                <Skeleton className='h-4 w-24 mt-1' />
                            </div>
                        </div>

                        <Skeleton className='h-24 w-full rounded-md' />

                        <div>
                            <Skeleton className='h-3 w-12' />
                            <div className='flex gap-2 mt-2'>
                                <Skeleton className='h-6 w-16 rounded-full' />
                                <Skeleton className='h-6 w-20 rounded-full' />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
