import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { WithTooltip } from '@/components/ui/tooltip'
import { studiedText } from '../../lib/durations'
import type { PeriodNumbers } from '../../lib/period-stats'
import { holdsToday, type StatsPeriod } from '../../lib/periods'
import { SECTION_TITLE } from '../StreakBlock'
import { usePeriodTitle } from '../../hooks/usePeriodTitle'

/** From 10 hours the lifetime total is in hours only ("86 giờ", 08 S-STUDY-03 › Cột phải). */
const HOURS_ONLY_FROM = 10 * 3600

/**
 * The Stats page's numbers of the period (08 S-STUDY-03 › Cột phải): its
 * total, how it stands against the period before ("+2 giờ 40 phút so với
 * tuần trước": a period still running against as many first days, said in
 * a Tooltip; "Tuần trước chưa học"; "Bằng tuần trước"; none for the first
 * period), the mean a day; then the lifetime total. No colour for up or down.
 */
export function PeriodTotals({
    period,
    numbers,
    today
}: {
    period: StatsPeriod
    numbers: PeriodNumbers
    today: string
}) {
    const { t } = useTranslation('study')
    const title = usePeriodTitle(period, today)
    const week = period.view === 'week'
    let versus: string | null = null
    if (numbers.nothingBefore) versus = t(week ? 'stats.noWeekBefore' : 'stats.noMonthBefore')
    else if (numbers.difference === 0) versus = t(week ? 'stats.sameWeek' : 'stats.sameMonth')
    else if (numbers.difference !== null) {
        versus = t(week ? 'stats.versusWeek' : 'stats.versusMonth', {
            sign: numbers.difference > 0 ? '+' : '−',
            time: studiedText(t, Math.abs(numbers.difference))
        })
    }
    const partly = versus !== null && !numbers.nothingBefore && holdsToday(period, today)
    return (
        <>
            {/* The rules between the numbers, 24 either side (the column's gap). */}
            <div className='border-t' />
            <section aria-labelledby='period-total-title' className='flex flex-col'>
                <h2 id='period-total-title' className={SECTION_TITLE}>
                    {title}
                </h2>
                <p className='mt-1 font-numeric text-title-2 text-text-primary'>{studiedText(t, numbers.total)}</p>
                {versus === null ? null : partly ? (
                    <WithTooltip label={t('stats.versusTip')}>
                        {/* Its Tooltip on hover; screen readers hear why with the words. */}
                        <p className='mt-1 w-fit text-label text-text-secondary'>
                            {versus}
                            <span className='sr-only'> ({t('stats.versusTip')})</span>
                        </p>
                    </WithTooltip>
                ) : (
                    <p className='mt-1 text-label text-text-secondary'>{versus}</p>
                )}
                <p className='mt-1 text-label text-text-secondary'>
                    {t('stats.average', { time: studiedText(t, numbers.average) })}
                </p>
            </section>
            <div className='border-t' />
            <section aria-labelledby='all-time-title' className='flex flex-col'>
                <h2 id='all-time-title' className={SECTION_TITLE}>
                    {t('stats.allTime')}
                </h2>
                <p className='mt-1 font-numeric text-title-2 text-text-primary'>
                    {numbers.allTime >= HOURS_ONLY_FROM
                        ? t('hours', { hours: Math.floor(numbers.allTime / 3600) })
                        : studiedText(t, numbers.allTime)}
                </p>
            </section>
        </>
    )
}
