import { Skeleton } from '@/components/ui/skeleton'

/** The profile page's shape (S-ME-02) while the profile loads: the avatar row, then three fields. */
export function ProfileSkeleton() {
    return (
        <div className='grid max-w-settings gap-8 p-6 lg:p-8' aria-busy='true'>
            <div className='flex items-center gap-6'>
                <Skeleton className='size-24 rounded-full' />
                <Skeleton className='h-8 w-28' />
            </div>
            <div className='grid max-w-[400px] gap-6'>
                <Skeleton className='h-16' />
                <Skeleton className='h-16' />
                <Skeleton className='h-24' />
            </div>
        </div>
    )
}
