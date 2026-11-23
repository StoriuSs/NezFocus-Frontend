import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { useGridKeys } from '../../hooks/useGridKeys'
import { dayTip, rangeText } from '../../lib/day-words'
import type { PeriodDay } from '../../lib/period-stats'
import { dayMonthOf, weekdayOf } from '../../lib/week'
import { SECTION_TITLE } from '../StreakBlock'
import { DayCell, DayLegend } from './DayCell'

/**
 * The 4-week grid (C-46, D-104): the 28 days up to the Sunday of the week
 * shown, Monday first, one row a week labelled by its Monday (no year: the
 * year is in the title, "4 TUẦN · 07/12/2026 – 03/01"); squares of 28, 6
 * apart. One Tab stop, the arrows move in it.
 */
export function StreakGrid({ days, today }: { days: PeriodDay[]; today: string }) {
    const { t, i18n } = useTranslation('study')
    const grid = useGridKeys(
        days.map((day) => !day.ahead),
        7,
        Math.max(
            0,
            days.findIndex((day) => day.today)
        )
    )
    const first = days[0]?.date ?? today
    const last = days.at(-1)?.date ?? today
    const weeks = [0, 1, 2, 3].map((week) => days.slice(week * 7, week * 7 + 7))
    return (
        <section aria-labelledby='streak-grid-title' className='flex flex-col gap-3'>
            <h2 id='streak-grid-title' className={SECTION_TITLE}>
                {t('stats.gridTitle', { range: rangeText(t, first, last, today, i18n.language) })}
            </h2>
            <div role='grid' aria-label={t('stats.grid')} className='flex flex-col gap-1.5'>
                <div role='row' className='flex gap-1.5'>
                    <span className='w-12 shrink-0' />
                    {weeks[0]?.map((day) => (
                        <span
                            key={day.date}
                            role='columnheader'
                            className='w-7 text-center text-label text-text-tertiary'
                        >
                            {t(`overview.stats.short.${weekdayOf(day.date)}`)}
                        </span>
                    ))}
                </div>
                {weeks.map((week, row) => (
                    <div key={week[0]?.date ?? row} role='row' className='flex items-center gap-1.5'>
                        <span role='rowheader' className='w-12 shrink-0 text-label text-text-tertiary'>
                            {/* Its own year as "today": never a year on a row (C-46). */}
                            {week[0] ? dayMonthOf(week[0].date, week[0].date, i18n.language) : null}
                        </span>
                        {week.map((day, column) => (
                            <DayCell
                                key={day.date}
                                day={day}
                                tip={dayTip(t, day, today, i18n.language)}
                                className='size-7'
                                cellProps={grid.cellProps(row * 7 + column)}
                            />
                        ))}
                    </div>
                ))}
            </div>
            <DayLegend reached={t('stats.reached')} notReached={t('stats.notReached')}>
                {/* 32 and the gap of 16: under the squares, as the 48 of the week labels. */}
                <span className='w-8 shrink-0' />
            </DayLegend>
        </section>
    )
}
