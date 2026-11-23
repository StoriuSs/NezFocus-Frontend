import { useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { dayTip } from '../lib/day-words'
import { STREAK_DAY_SECONDS } from '../lib/today'
import {
    barHeight,
    CHART_HEIGHT,
    chartScale,
    PAGE_CHART_HEIGHT,
    dayMonthOf,
    weekdayOf,
    type WeekBar
} from '../lib/week'

/**
 * This week's minutes as seven columns (C-45, 08 S-STUDY-01), built of
 * `div`s: the minutes over each column ("0" for none, a line of 2), to scale
 * of the week's most (60 minutes at least), the dashed 15-minute line with
 * its words at the right end, so a day reaching it reads without colour.
 * Reached `surface-3`, not `border`, today `primary` with its label 600;
 * the days ahead have no column. One Tab stop, ← → between the days gone by,
 * each with its Tooltip ("Thứ 6, 16/10 · 60 phút", "Hôm nay · 45 phút"); a
 * table for screen readers says the same. `page`: the Stats page's chart
 * (C-45 `page`): 160 at most, columns 40 wide; `label` names it there.
 */
export function WeekChart({
    bars,
    today,
    size = 'card',
    label
}: {
    bars: WeekBar[]
    today: string
    size?: 'card' | 'page'
    label?: string
}) {
    const { t, i18n } = useTranslation('study')
    // Minutes, never hours: as the numbers over the columns (08 `hover`, edge `week-spike`).
    const minutesOf = (bar: WeekBar) => t('minutes', { count: Math.floor(bar.seconds / 60) })
    const dayOf = (bar: WeekBar) => dayMonthOf(bar.date, today, i18n.language)
    const scale = chartScale(bars)
    const full = size === 'page' ? PAGE_CHART_HEIGHT : CHART_HEIGHT
    const caption = label ?? t('overview.stats.chart')
    const shown = bars.filter((bar) => !bar.ahead)
    const todayIndex = shown.findIndex((bar) => bar.today)
    const [active, setActive] = useState(Math.max(0, todayIndex))
    // A week with fewer days gone by (back to this one): the stop on today again.
    const current = active < shown.length ? active : Math.max(0, todayIndex)
    const columns = useRef<(HTMLDivElement | null)[]>([])
    const tipOf = (bar: WeekBar) => dayTip(t, bar, today, i18n.language)

    const move = (event: KeyboardEvent, index: number) => {
        const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : null
        if (next === null || next < 0 || next >= shown.length) return
        event.preventDefault()
        setActive(next)
        columns.current[next]?.focus()
    }

    return (
        <div className='mt-4'>
            <div role='group' aria-label={caption} className='relative flex pr-12'>
                {/* The 15-minute line, under the columns (drawn first), its words at the right end. */}
                <div
                    aria-hidden='true'
                    className='pointer-events-none absolute inset-x-0 flex items-center'
                    style={{ bottom: barHeight(STREAK_DAY_SECONDS, scale, full) - 7 }}
                >
                    <span className='flex-1 border-t border-dashed border-border-input' />
                    <span className='w-12 pl-2 text-micro text-text-tertiary'>{t('overview.stats.line')}</span>
                </div>
                {bars.map((bar) => {
                    const index = shown.indexOf(bar)
                    const column = (
                        <div
                            key={bar.date}
                            ref={(element) => {
                                if (index >= 0) columns.current[index] = element
                            }}
                            role={bar.ahead ? undefined : 'img'}
                            tabIndex={bar.ahead ? undefined : index === current ? 0 : -1}
                            aria-label={bar.ahead ? undefined : tipOf(bar)}
                            onKeyDown={bar.ahead ? undefined : (event) => move(event, index)}
                            onFocus={bar.ahead ? undefined : () => setActive(index)}
                            className='relative flex flex-1 flex-col items-center justify-end gap-1 rounded-badge outline-none focus-visible:ring-2 focus-visible:ring-ring'
                            style={{ height: full + 20 }}
                        >
                            {bar.ahead ? null : (
                                <>
                                    <span
                                        aria-hidden='true'
                                        className='font-numeric text-micro tabular-nums text-text-secondary'
                                    >
                                        {Math.floor(bar.seconds / 60)}
                                    </span>
                                    <span
                                        aria-hidden='true'
                                        className={cn(
                                            'rounded-t-badge',
                                            size === 'page' ? 'w-10' : 'w-[45%] min-w-5 max-w-8',
                                            bar.today
                                                ? 'bg-primary'
                                                : bar.seconds >= STREAK_DAY_SECONDS
                                                  ? 'bg-surface-3'
                                                  : 'bg-border'
                                        )}
                                        style={{ height: barHeight(bar.seconds, scale, full) }}
                                    />
                                </>
                            )}
                        </div>
                    )
                    return bar.ahead ? (
                        column
                    ) : (
                        <WithTooltip key={bar.date} label={tipOf(bar)}>
                            {column}
                        </WithTooltip>
                    )
                })}
            </div>
            <div aria-hidden='true' className='mt-1 flex pr-12'>
                {bars.map((bar) => (
                    <span
                        key={bar.date}
                        className={cn(
                            'flex-1 text-center text-label',
                            bar.today ? 'font-semibold text-text-primary' : 'text-text-tertiary'
                        )}
                    >
                        {t(`overview.stats.short.${weekdayOf(bar.date)}`)}
                    </span>
                ))}
            </div>
            <table className='sr-only'>
                <caption>{caption}</caption>
                <thead>
                    <tr>
                        <th scope='col'>{t('overview.stats.day')}</th>
                        <th scope='col'>{t('overview.stats.minutesColumn')}</th>
                    </tr>
                </thead>
                <tbody>
                    {shown.map((bar) => (
                        <tr key={bar.date}>
                            <th scope='row'>
                                {t(`overview.stats.long.${weekdayOf(bar.date)}`)} {dayOf(bar)}
                            </th>
                            <td>{minutesOf(bar)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
