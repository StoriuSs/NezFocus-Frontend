import { Skeleton } from '@/components/ui/skeleton'

/** Two line widths that differ from one message to the next (S-CHAT-01 `loading`). */
const widths = (index: number): [string, string] => {
    if (index % 3 === 0) return ['w-48', 'w-24']
    return index % 3 === 1 ? ['w-28', 'w-56'] : ['w-56', 'w-28']
}

/** Skeleton messages: six while a channel first loads, two above while older ones do. */
export function MessageSkeletons({ count }: { count: number }) {
    return (
        <div aria-hidden='true'>
            {Array.from({ length: count }, (_, index) => {
                const [first, second] = widths(index)
                return (
                    <div key={index} className='flex gap-3 px-4 py-2'>
                        <Skeleton className='size-10 shrink-0 rounded-full' />
                        <div className='flex flex-1 flex-col gap-2 pt-1'>
                            <Skeleton className={`h-3.5 ${first}`} />
                            <Skeleton className={`h-3.5 ${second}`} />
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
