import mascotHappy from '@/assets/mascot/runtime-happy-320.webp'
import { Mascot } from '@/components/brand/mascot/Mascot'

/** Runtime is in view whenever a block of the study pages is: load its animation at any width. */
export const ALWAYS = '(min-width: 0px)'

/**
 * Runtime cheering at the top of the numbers (C-45): a streak milestone
 * ("7 ngày liên tiếp — giữ nhịp tốt lắm"), or on the Stats page one's best
 * week ("Tuần học nhiều nhất của bạn"); happy 120 left of a `headline`.
 */
export function CheerBlock({ children }: { children: string }) {
    return (
        <div className='mb-6 flex items-center gap-4'>
            <Mascot mood='happy' size={120} still={mascotHappy} loadWhen={ALWAYS} className='shrink-0' />
            <p className='text-headline font-semibold text-text-primary'>{children}</p>
        </div>
    )
}
