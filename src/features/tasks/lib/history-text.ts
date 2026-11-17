import type { TFunction } from 'i18next'
import '@/i18n/tasks'
import { timeIn, wallClock } from '@/lib/time-zones'
import type { TaskEvent, TaskStatus } from '../types'
import { dateOf, daysBetween } from './due-text'
import { nameOf } from './people'

/** Where and in what words a line's times are written: the account's zone (AUTH-08), the language on screen. */
export interface HistoryClock {
    now: Date
    timeZone: string | undefined
    language: string
}

const sameYear = (at: Date, { now, timeZone }: HistoryClock) =>
    wallClock(at, timeZone).year === wallClock(now, timeZone).year

/**
 * When a line was written (05 Q3): "20:05" today, "Hôm qua 21:40", else
 * "16/10 09:10", with the year when it is not this one.
 */
export function historyTime(at: Date, clock: HistoryClock, yesterday: string): string {
    const { now, timeZone, language } = clock
    const time = timeIn(timeZone, at)
    const days = daysBetween(now, at, timeZone)
    if (days === 0) return time
    if (days === -1) return `${yesterday} ${time}`
    return `${dateOf(at, language, timeZone, !sameYear(at, clock))} ${time}`
}

/** A due date in a line: "20/10 · 23:59", the time always (05 R2), the year when not this one. */
export function historyDue(at: Date, clock: HistoryClock): string {
    return `${dateOf(at, clock.language, clock.timeZone, !sameYear(at, clock))} · ${timeIn(clock.timeZone, at)}`
}

/**
 * One line of a task's history in words (05 S-TASK-02 › Lịch sử,
 * REQ-TASK-03): "Bạn" for oneself, "bạn" when one is the person added or
 * taken off; someone adding or taking off themselves "đã tự nhận việc" /
 * "đã rút khỏi việc"; taken off by no one, they left the server (D-195).
 */
export function historyLine(
    line: TaskEvent,
    me: string | undefined,
    t: TFunction<'tasks'>,
    clock: HistoryClock
): string {
    const deleted = t('people.deleted')
    const who = !line.actor ? '' : line.actor.id === me ? t('history.you') : nameOf(line.actor, deleted)
    const whom = !line.subject ? '' : line.subject.id === me ? t('history.youObject') : nameOf(line.subject, deleted)
    const status = (value: string | null) => t(`status.${(value ?? 'todo') as TaskStatus}`)
    const due = (value: string | null) => (value ? historyDue(new Date(value), clock) : '')
    switch (line.kind) {
        case 'created':
            return t('history.created', { who })
        case 'title_changed':
            return t('history.titleChanged', { who, from: line.from ?? '', to: line.to ?? '' })
        case 'description_changed':
            return t('history.descriptionChanged', { who })
        case 'due_changed':
            if (!line.to) return t('history.dueCleared', { who })
            if (!line.from) return t('history.dueSet', { who, to: due(line.to) })
            return t('history.dueChanged', { who, from: due(line.from), to: due(line.to) })
        case 'assignee_added':
            return line.actor && line.actor.id === line.subject?.id
                ? t('history.claimed', { who })
                : t('history.added', { who, whom })
        case 'assignee_removed': {
            if (!line.actor) {
                // Taken off by the app: the name as others know it, even one's own.
                const name = line.subject ? nameOf(line.subject, deleted) : deleted
                return t('history.leftServer', { whom: name })
            }
            return line.actor.id === line.subject?.id
                ? t('history.withdrew', { who })
                : t('history.removed', { who, whom })
        }
        case 'status_changed':
            return t('history.statusChanged', { who, from: status(line.from), to: status(line.to) })
    }
}
