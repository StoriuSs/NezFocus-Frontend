import { Trans, useTranslation } from 'react-i18next'
import '@/i18n/study'
import { studiedText } from '../../lib/durations'
import type { PeriodNumbers } from '../../lib/period-stats'
import type { StatsPeriod } from '../../lib/periods'
import { WeekChart } from '../WeekChart'
import { MonthCalendar } from './MonthCalendar'
import { usePeriodTitle } from '../../hooks/usePeriodTitle'

/**
 * The Stats page's left top (08 S-STUDY-03): "TUẦN NÀY · 4 giờ 35 phút"
 * ("TUẦN 05/10 – 11/10 · …", "THÁNG 10/2026 · …") over the week's chart
 * (C-45 `page`) or the month (C-46 `month`), then the split "Phòng học 3 giờ
 * 6 phút · Một mình 1 giờ 29 phút" ("Một mình 0 phút" too).
 */
export function PeriodChart({
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
    return (
        <section aria-labelledby='period-chart-title' className='flex flex-col'>
            <h2 id='period-chart-title' className='text-label font-semibold text-text-tertiary'>
                <Trans
                    t={t}
                    i18nKey='stats.title'
                    values={{ label: title, time: studiedText(t, numbers.total) }}
                    components={[<span key='label' className='uppercase' />]}
                />
            </h2>
            {period.view === 'week' ? (
                <WeekChart bars={numbers.days} today={today} size='page' label={t('stats.chart')} />
            ) : (
                <MonthCalendar period={period} days={numbers.days} today={today} />
            )}
            <p className='mt-4 text-label text-text-secondary'>
                {t('stats.split', { room: studiedText(t, numbers.room), solo: studiedText(t, numbers.solo) })}
            </p>
        </section>
    )
}
