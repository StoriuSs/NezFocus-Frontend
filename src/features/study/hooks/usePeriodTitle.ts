import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { monthText, rangeText } from '../lib/day-words'
import { holdsToday, type StatsPeriod } from '../lib/periods'

/** A period's name as its titles write it (08 S-STUDY-03): "Tuần này", "Tuần 05/10 – 11/10", "Tháng 10/2026". */
export function usePeriodTitle(period: StatsPeriod, today: string): string {
    const { t, i18n } = useTranslation('study')
    if (period.view === 'month') return monthText(t, period.start, i18n.language)
    if (holdsToday(period, today)) return t('stats.thisWeek')
    return t('stats.weekOf', { range: rangeText(t, period.start, period.end, today, i18n.language) })
}
