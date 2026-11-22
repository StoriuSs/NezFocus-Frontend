import type { TFunction } from 'i18next'
import { clockText, minutesLeft, remainingMs } from './phases'
import type { AnySession } from '../types'

/**
 * "còn 18 phút", "còn dưới 1 phút" in the last minute (C-19 `list`), in the
 * shell's words, as plain text (the words mark the number, `<0>`, for the
 * list line's numeric face: the servers feature's `PhaseListLine`).
 */
export function leftText(t: TFunction<'common'>, ms: number): string {
    const minutes = minutesLeft(ms)
    return minutes > 0
        ? t('shell.study.left', { count: minutes }).replace(/<\/?0>/g, '')
        : t('shell.study.underAMinute')
}

/** The phase's name, or "Tạm dừng" while paused (C-19), in the shell's words. */
export const phaseName = (t: TFunction<'common'>, session: AnySession): string =>
    t(session.status === 'paused' ? 'shell.study.phase.paused' : `shell.study.phase.${session.phase}`)

/** "Tập trung · còn 18 phút"; paused, "Tạm dừng" (C-19 `list`): a phase in words, minutes and no seconds. */
export const sessionLineText = (t: TFunction<'common'>, session: AnySession, now: number): string =>
    session.status === 'paused'
        ? phaseName(t, session)
        : t('shell.study.line', { phase: phaseName(t, session), left: leftText(t, remainingMs(session, now)) })

/**
 * The session's part of the tab's title (07 S-ROOM-05, X-01): "18:42 · Tập
 * trung", counting down each second; paused, the number still: "18:42 · Tạm dừng".
 */
export const tabText = (t: TFunction<'common'>, session: AnySession, now: number): string =>
    t('shell.study.tab', { clock: clockText(remainingMs(session, now)), phase: phaseName(t, session) })
