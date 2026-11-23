import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { useGridKeys } from '../../hooks/useGridKeys'
import { dayTip } from '../../lib/day-words'
import type { PeriodDay } from '../../lib/period-stats'
import { monthWeeks, type StatsPeriod } from '../../lib/periods'
import { STREAK_DAY_SECONDS } from '../../lib/today'
import { cn } from '@/lib/utils'
import { DayCell, DayLegend } from './DayCell'

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/**
 * The month (C-46 `month`, D-105), on the Stats page's left when viewing
 * Tháng: Monday first, a cell 56 high for each day of the month (none for
 * days outside it), its day at the top left and its minutes in the middle
 * ("—" for none); reached, not yet, today and ahead as the 4-week grid; a
 * day ahead shows only its day. One Tab stop, the arrows move in it.
 */
export function MonthCalendar({ period, days, today }: { period: StatsPeriod; days: PeriodDay[]; today: string }) {
    const { t, i18n } = useTranslation('study')
    const byDate = new Map(days.map((day) => [day.date, day]))
    const cells = monthWeeks(period).flat()
    const grid = useGridKeys(
        cells.map((date) => date !== null && byDate.get(date)?.ahead === false),
        7,
        cells.indexOf(today)
    )
    const rows = Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7))
    return (
        <div className='mt-4 flex flex-col gap-3'>
            <div role='grid' aria-label={t('stats.calendar')} className='flex flex-col gap-1.5'>
                <div role='row' className='flex gap-1.5'>
                    {WEEKDAYS.map((weekday) => (
                        <span
                            key={weekday}
                            role='columnheader'
                            className='flex-1 text-center text-label text-text-tertiary'
                        >
                            {t(`overview.stats.short.${weekday}`)}
                        </span>
                    ))}
                </div>
                {rows.map((row, index) => (
                    <div key={row.find(Boolean) ?? index} role='row' className='flex gap-1.5'>
                        {row.map((date, column) => {
                            const day = date ? byDate.get(date) : undefined
                            if (!date || !day)
                                return <span key={`${index}-${column}`} role='gridcell' className='flex-1' />
                            const minutes = Math.floor(day.seconds / 60)
                            return (
                                <DayCell
                                    key={date}
                                    day={day}
                                    tip={dayTip(t, day, today, i18n.language)}
                                    className='flex h-14 flex-1 flex-col justify-between p-2'
                                    cellProps={grid.cellProps(index * 7 + column)}
                                >
                                    <span
                                        aria-hidden='true'
                                        className={cn(
                                            'text-label',
                                            (day.ahead || day.seconds < STREAK_DAY_SECONDS) && 'text-text-tertiary'
                                        )}
                                    >
                                        {Number(date.slice(8))}
                                    </span>
                                    {day.ahead ? null : (
                                        <span
                                            aria-hidden='true'
                                            className={cn(
                                                'font-numeric text-numeric-inline',
                                                day.seconds < STREAK_DAY_SECONDS && 'text-text-primary'
                                            )}
                                        >
                                            {minutes === 0 ? '—' : minutes}
                                        </span>
                                    )}
                                </DayCell>
                            )
                        })}
                    </div>
                ))}
            </div>
            <DayLegend reached={t('stats.reached')} notReached={t('stats.notReached')} />
        </div>
    )
}
