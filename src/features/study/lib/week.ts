import { wallClock } from '@/lib/time-zones'
import type { StudyWeek } from '../types'
import { STREAK_DAY_SECONDS } from './today'

/** One day's column of the week chart (C-45). */
export interface WeekBar {
    /** YYYY-MM-DD. */
    date: string
    seconds: number
    today: boolean
    /** Still ahead: no column, no number. */
    ahead: boolean
}

/** The streak lengths Runtime cheers for, all the day they are reached (C-45 › Mốc). */
export const STREAK_MILESTONES = [7, 30, 100, 365]

/** The chart's tallest column, in pixels (C-45: 96 on the Study page). */
export const CHART_HEIGHT = 96

/** The day `now` falls on in the zone given (the account's; the browser's while unknown), as YYYY-MM-DD. */
export function dateKeyAt(now: number, timeZone?: string): string {
    const { year, month, day } = wallClock(new Date(now), timeZone)
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * The week's columns, Monday first (C-45): what the backend counted, today's
 * as it stands now (`todaySeconds`, the running focus in: it grows each
 * minute), the days after today ahead.
 */
export function weekBars(week: StudyWeek, todaySeconds: number): WeekBar[] {
    return week.days.map((day) => ({
        date: day.date,
        seconds: day.date === week.today ? todaySeconds : day.seconds,
        today: day.date === week.today,
        ahead: day.date > week.today
    }))
}

/** The week's total: the sum of its columns ("TUẦN NÀY · 4 giờ 35 phút"). */
export const weekTotal = (bars: WeekBar[]): number => bars.reduce((sum, bar) => sum + (bar.ahead ? 0 : bar.seconds), 0)

/** The seconds the tallest column stands for: the week's most, never under 60 minutes (C-45). */
export const chartScale = (bars: WeekBar[]): number => Math.max(3600, ...bars.map((bar) => bar.seconds))

/** A column's height in pixels: to scale, at least 4 when it has seconds; a day with none is a line of 2 (C-45). */
export function barHeight(seconds: number, scale: number, full = CHART_HEIGHT): number {
    if (seconds <= 0) return 2
    return Math.max(4, Math.round((seconds / scale) * full))
}

/** Whether the streak shown is a milestone reached today: today has its 15 minutes (C-45 › Mốc). */
export const isMilestoneDay = (streak: number, todaySeconds: number): boolean =>
    STREAK_MILESTONES.includes(streak) && todaySeconds >= STREAK_DAY_SECONDS

/**
 * A day of the chart as 08 › Ngày tháng writes it: "20/11", the year only
 * when it is not today's ("31/12/2026"), day and month in the language's
 * order ("11/20" in English), as the Task Board's dates (05).
 */
export function dayMonthOf(date: string, today: string, language: string): string {
    return new Intl.DateTimeFormat(language, {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' })
    })
        .formatToParts(new Date(`${date}T00:00:00Z`))
        .filter((part) => part.type !== 'literal')
        .map((part) => part.value)
        .join('/')
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/** The day of the week of a YYYY-MM-DD date, as the chart's words name it ("T2" → "CN"). */
export function weekdayOf(date: string): (typeof WEEKDAYS)[number] {
    return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? 'mon'
}
