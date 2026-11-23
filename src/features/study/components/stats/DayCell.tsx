import type { KeyboardEvent, ReactNode } from 'react'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { PeriodDay } from '../../lib/period-stats'
import { STREAK_DAY_SECONDS } from '../../lib/today'

/**
 * A day of the 4-week grid or the month (C-46): reached 15 minutes, filled
 * `primary`; not yet, an outline `border-input`; today a 2 `text-primary`
 * edge as well; a day ahead, nothing (no focus, no Tooltip). Read in black
 * and white by filled or not. Focused or hovered, its Tooltip
 * ("Thứ 6, 09/10 · 25 phút"), which screen readers hear as its name.
 */
export function DayCell({
    day,
    tip,
    className,
    cellProps,
    children
}: {
    day: PeriodDay
    tip: string
    className?: string
    cellProps: {
        ref: (element: HTMLElement | null) => void
        tabIndex?: number
        onKeyDown?: (event: KeyboardEvent) => void
        onFocus?: () => void
    }
    children?: ReactNode
}) {
    const reached = day.seconds >= STREAK_DAY_SECONDS
    const cell = (
        <div
            role='gridcell'
            aria-label={day.ahead ? undefined : tip}
            {...cellProps}
            className={cn(
                'rounded-badge outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                !day.ahead && (reached ? 'bg-primary text-on-primary' : 'border border-border-input'),
                day.today && 'border-2 border-text-primary',
                className
            )}
        >
            {children}
        </div>
    )
    return day.ahead ? cell : <WithTooltip label={tip}>{cell}</WithTooltip>
}

/** "■ Đủ 15 phút  □ Chưa đủ" under the grid and the month (C-46); `children` before the words. */
export function DayLegend({
    reached,
    notReached,
    children
}: {
    reached: string
    notReached: string
    /** The 4-week grid's room for its week labels. */
    children?: ReactNode
}) {
    return (
        <p aria-hidden='true' className='flex items-center gap-4 text-label text-text-secondary'>
            {children}
            <span className='flex items-center gap-1.5'>
                <span className='size-3 rounded-badge bg-primary' />
                {reached}
            </span>
            <span className='flex items-center gap-1.5'>
                <span className='size-3 rounded-badge border border-border-input' />
                {notReached}
            </span>
        </p>
    )
}
