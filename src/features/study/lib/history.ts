import type { TFunction } from 'i18next'
import '@/i18n/study'
import { timeIn } from '@/lib/time-zones'
import type { AnySession, StudyHistoryLine, StudyToday } from '../types'
import { studiedText } from './durations'
import { runningBetween } from './today'
import { dateKeyAt, dayMonthOf, weekdayOf } from './week'

/**
 * Where a line of the history was (C-47, D-230), as one may know it now:
 * "Học một mình"; "{Phòng} · {Server}"; "Phòng đã bị xóa · {Server}"; "Một
 * phòng của {Server}" (a room one no longer views); "Một phòng học" (a
 * server one is no longer in, or deleted).
 */
export function lineTitle(t: TFunction<'study'>, line: StudyHistoryLine): string {
    if (line.kind === 'solo') return t('stats.solo')
    if (line.serverName === null) return t('stats.someRoom')
    if (line.roomDeleted) return t('stats.roomDeleted', { server: line.serverName })
    if (line.roomName === null) return t('stats.hiddenRoom', { server: line.serverName })
    return t('stats.roomOf', { room: line.roomName, server: line.serverName })
}

/**
 * When (C-47): "T7 17/10 · 20:00 – 20:50", the year when not this year's
 * ("T5 31/12/2026 · …"); past midnight the end's day after it ("23:30 – 00:40
 * (T2)"); still in it "– bây giờ"; joined more than once "· vào 2 lần". In
 * one's zone (`timeZone`).
 */
export function lineWhen(
    t: TFunction<'study'>,
    line: StudyHistoryLine,
    today: string,
    language: string,
    timeZone: string | undefined
): string {
    const from = new Date(line.firstJoinedAt)
    const day = dateKeyAt(from.getTime(), timeZone)
    let to = t('stats.now')
    if (line.lastLeftAt !== null) {
        const left = new Date(line.lastLeftAt)
        const leftDay = dateKeyAt(left.getTime(), timeZone)
        to = timeIn(timeZone, left)
        if (leftDay !== day) to = t('stats.endDay', { time: to, day: t(`overview.stats.short.${weekdayOf(leftDay)}`) })
    }
    const when = t('stats.when', {
        day: t(`overview.stats.short.${weekdayOf(day)}`),
        date: dayMonthOf(day, today, language),
        from: timeIn(timeZone, from),
        to
    })
    return line.joinCount > 1 ? `${when} · ${t('stats.joins', { count: line.joinCount })}` : when
}

/** How long (C-47): "45 phút", "1 giờ 5 phút", "9 giờ"; 1–59 seconds "dưới 1 phút". */
export const lineTime = (t: TFunction<'study'>, seconds: number): string =>
    seconds > 0 && seconds < 60 ? t('stats.underAMinute') : studiedText(t, seconds)

/**
 * The seconds of a line at `now` (D-235). The one one is in (no
 * `lastLeftAt`) gains what today gained since the history was read
 * (`todaySeconds` now, the running focus in, less `countedToday` then): a
 * count landing before the history is read again neither drops it nor counts
 * twice. Read before today was, it gains the focus of the session running
 * here after where today's count stands. Any other line is as read.
 */
export function lineSecondsAt(
    line: StudyHistoryLine,
    {
        countedToday,
        todaySeconds,
        session,
        today,
        now,
        readDay = null,
        dayStart = null,
        before = 0
    }: {
        countedToday: number | null
        todaySeconds: number
        session: AnySession | null
        today: StudyToday | undefined
        now: number
        /** The start of the day the history was read on (`countedToday`'s day). */
        readDay?: number | null
        /** The start of today. */
        dayStart?: number | null
        /** The focus run to midnight no count has written yet (`runningBeforeDay`). */
        before?: number
    }
): number {
    if (line.lastLeftAt !== null) return line.seconds
    // Read on a day gone by, no count since (D-236): the focus run since then is the run to midnight and today's.
    if (countedToday !== null && readDay !== null && dayStart !== null && readDay !== dayStart && before > 0)
        return line.seconds + before + todaySeconds
    if (countedToday !== null) return line.seconds + Math.max(0, todaySeconds - countedToday)
    if (session?.id !== line.sessionId || !today?.countedUntil) return line.seconds
    return line.seconds + runningBetween(session, Date.parse(today.countedUntil), now)
}
