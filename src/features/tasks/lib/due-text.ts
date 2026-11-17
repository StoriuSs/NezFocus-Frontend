import { timeIn, wallClock } from '@/lib/time-zones'
import type { Task } from '../types'

/** The words a due date is written with, in the language on screen. */
export interface DayWords {
    today: string
    tomorrow: string
    /** Short weekday names, 0 is Sunday ("CN", "Thứ 2"…). */
    weekdays: readonly string[]
    overdue: string
    done: string
    noDue: string
}

const DAY = 86_400_000

/** Days from `now`'s date to `at`'s, both read in zone `timeZone`. */
export function daysBetween(now: Date, at: Date, timeZone?: string): number {
    const a = wallClock(at, timeZone)
    const n = wallClock(now, timeZone)
    return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(n.year, n.month - 1, n.day)) / DAY)
}

/** "23/10", or "05/01/2027": day and month in the language's order, joined by "/" (as endsAt does). */
function dateOf(at: Date, language: string, timeZone: string | undefined, withYear: boolean): string {
    return new Intl.DateTimeFormat(language, {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        ...(withYear ? { year: 'numeric' } : {})
    })
        .formatToParts(at)
        .filter((part) => part.type !== 'literal')
        .map((part) => part.value)
        .join('/')
}

/**
 * The day part of a due date (05 › Quy ước › Thời gian): "Hôm nay",
 * "Ngày mai", within the next 7 days the weekday ("Thứ 6, 23/10", "CN,
 * 25/10", no year even past new year), further "05/11", and the year only
 * when it is not this one ("05/01/2027"). In the account's zone (AUTH-08).
 */
export function dayPart(at: Date, now: Date, timeZone: string | undefined, language: string, words: DayWords): string {
    const days = daysBetween(now, at, timeZone)
    if (days === 0) return words.today
    if (days === 1) return words.tomorrow
    if (days >= 2 && days <= 6) {
        return `${words.weekdays[wallClock(at, timeZone).weekday]}, ${dateOf(at, language, timeZone, false)}`
    }
    const sameYear = wallClock(at, timeZone).year === wallClock(now, timeZone).year
    return dateOf(at, language, timeZone, !sameYear)
}

/** "Thứ 6, 23/10 · 23:59": the time always shows (05 R2). */
export function dueText(at: Date, now: Date, timeZone: string | undefined, language: string, words: DayWords): string {
    return `${dayPart(at, now, timeZone, language, words)} · ${timeIn(timeZone, at)}`
}

export interface DueLine {
    /** `overdue` is `danger`; `done` and `none` are quieter (C-28 › Hạn). */
    kind: 'due' | 'overdue' | 'none' | 'done'
    text: string
}

/**
 * The line under a task's title on the board (C-28 › Hạn): its due date,
 * "Quá hạn · 16/10 · 23:59" once past, "Không hạn" without one; a done task
 * says when it was done instead, never overdue (05 R8).
 */
export function dueLine(
    task: Pick<Task, 'status' | 'dueAt' | 'completedAt'>,
    now: Date,
    timeZone: string | undefined,
    language: string,
    words: DayWords
): DueLine {
    if (task.status === 'done' && task.completedAt) {
        return {
            kind: 'done',
            text: `${words.done} · ${dueText(new Date(task.completedAt), now, timeZone, language, words)}`
        }
    }
    if (!task.dueAt) return { kind: 'none', text: words.noDue }
    const due = new Date(task.dueAt)
    const text = dueText(due, now, timeZone, language, words)
    return due.getTime() < now.getTime()
        ? { kind: 'overdue', text: `${words.overdue} · ${text}` }
        : { kind: 'due', text }
}
