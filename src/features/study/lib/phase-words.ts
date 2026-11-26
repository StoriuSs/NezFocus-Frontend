import type { TFunction } from 'i18next'
import { clockText, minutesLeft, remainingMs, type PhaseState } from './phases'
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

/** The phase's name, "Tạm dừng" while paused, "Hết giờ nghỉ" for a Solo waiting (C-19), in the shell's words. */
export const phaseName = (t: TFunction<'common'>, session: PhaseState): string =>
    t(
        session.status === 'paused'
            ? 'shell.study.phase.paused'
            : session.status === 'waiting'
              ? 'shell.study.phase.waiting'
              : `shell.study.phase.${session.phase}`
    )

/** "Tập trung · còn 18 phút"; paused, "Tạm dừng"; waiting, "Hết giờ nghỉ" (C-19 `list`): minutes, no seconds. */
export const sessionLineText = (t: TFunction<'common'>, session: PhaseState, now: number): string =>
    session.status === 'paused' || session.status === 'waiting'
        ? phaseName(t, session)
        : t('shell.study.line', { phase: phaseName(t, session), left: leftText(t, remainingMs(session, now)) })

/**
 * The session's part of the tab's title (07 S-ROOM-05, X-01): "18:42 · Tập
 * trung", counting down each second; paused, the number still: "18:42 · Tạm dừng";
 * a Solo waiting for Học tiếp, no number: "Hết giờ nghỉ" (08 S-STUDY-02).
 */
export const tabText = (t: TFunction<'common'>, session: AnySession, now: number): string =>
    session.status === 'waiting'
        ? t('shell.study.waitTab')
        : t('shell.study.tab', { clock: clockText(remainingMs(session, now)), phase: phaseName(t, session) })
