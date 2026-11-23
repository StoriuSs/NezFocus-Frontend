import type { TFunction } from 'i18next'
import '@/i18n/study'
import { dayMonthOf, weekdayOf } from './week'

/**
 * A day's Tooltip on the chart, the 4-week grid and the month (C-45, C-46):
 * "Thứ 6, 09/10 · 25 phút", today "Hôm nay · 45 phút"; minutes, never hours
 * (08 `hover`, edge `week-spike`); the year only when not this year's.
 */
export function dayTip(
    t: TFunction<'study'>,
    day: { date: string; seconds: number },
    today: string,
    language: string
): string {
    const time = t('minutes', { count: Math.floor(day.seconds / 60) })
    if (day.date === today) return t('overview.stats.tipToday', { time })
    return t('overview.stats.tip', {
        day: t(`overview.stats.long.${weekdayOf(day.date)}`),
        date: dayMonthOf(day.date, today, language),
        time
    })
}

/** A period's days as its label writes them (08 › Ngày tháng): "12/10 – 18/10", "28/12/2026 – 03/01". */
export const rangeText = (t: TFunction<'study'>, start: string, end: string, today: string, language: string) =>
    t('stats.range', { start: dayMonthOf(start, today, language), end: dayMonthOf(end, today, language) })

/** A month as its label writes it, always with its year: "Tháng 10/2026", "October 2026". */
export function monthText(t: TFunction<'study'>, start: string, language: string): string {
    const name = new Intl.DateTimeFormat(language, { month: 'long', timeZone: 'UTC' }).format(
        new Date(`${start}T00:00:00Z`)
    )
    return t('stats.monthName', { month: start.slice(5, 7), year: start.slice(0, 4), name })
}
