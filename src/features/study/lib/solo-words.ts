import type { TFunction } from 'i18next'
import '@/i18n/study'
import { accountTimeZone, timeIn } from '@/lib/time-zones'
import { nextPhaseOf, roundOf } from './phases'
import type { FocusSession } from '../types'

/**
 * The line under a Solo's phase (C-18 › Dòng chu kỳ), at one's own zone's
 * times: focus "Vòng 1 · nghỉ ngắn lúc 22:19"; a break "Hết nghỉ lúc 22:29"
 * (a Solo waits for Học tiếp, it does not go back to focus by itself);
 * paused "Bạn đã tạm dừng"; syncing again "Đang đồng bộ lại…". The Solo
 * page under its number, the Study page's Solo block under its phase.
 */
export function soloLine(t: TFunction<'study'>, session: FocusSession, syncing = false): string {
    if (syncing) return t('ring.syncing')
    if (session.status === 'paused') return t('ring.pausedByYou')
    const at = session.phaseEndsAt ? timeIn(accountTimeZone(), new Date(session.phaseEndsAt)) : ''
    if (session.phase !== 'focus') return t('solo.breakEnds', { time: at })
    const next = nextPhaseOf(session) as 'short_break' | 'long_break'
    return t('ring.cycle', { round: roundOf(session), next: t(`next.${next}`), time: at })
}
