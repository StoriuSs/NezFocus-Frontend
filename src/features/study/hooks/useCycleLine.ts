import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { accountTimeZone, timeIn } from '@/lib/time-zones'
import { nextPhaseOf, roundOf } from '../lib/phases'
import { useStudyStore } from '../study.store'
import type { AnySession } from '../types'

/**
 * The line under the ring's number (C-18 › Dòng chu kỳ), at the times of
 * one's own zone:
 * - focus: "Vòng 2 · nghỉ ngắn lúc 22:06" (the next phase worked out as the
 *   backend does, no total of rounds);
 * - a break: "Tập trung lại lúc 22:11";
 * - paused: who paused, as heard ("Bạn đã tạm dừng", "An đã tạm dừng"),
 *   else "Đã tạm dừng" (D-231); for one who may resume a session with no
 *   Host, or whose Host left while it was paused, "Bấm Tiếp tục để chạy
 *   lại" (D-119, 07 › Edge);
 * - syncing again: "Đang đồng bộ lại…".
 * `pressResume`: the line asks one to resume, and the note "Đồng hồ đứng
 * yên" under the ring is for the others.
 */
export function useCycleLine(
    session: AnySession | null,
    {
        channelId,
        me,
        nameOf,
        canResume,
        syncing
    }: { channelId: string; me: string; nameOf: (userId: string) => string; canResume: boolean; syncing: boolean }
): { text: string; pressResume: boolean } {
    const { t } = useTranslation('study')
    const pausedBy = useStudyStore((state) => (session ? state.pausedBy[session.id] : undefined))
    const news = useStudyStore((state) => state.news[channelId])
    const said = (text: string, pressResume = false) => ({ text, pressResume })
    if (!session) return said('')
    if (syncing) return said(t('ring.syncing'))
    if (session.status === 'paused') {
        const hostLeft = news?.id === session.id && news.version === session.version && news.action === 'host'
        if (canResume && (session.hostId === null || hostLeft)) return said(t('ring.pressResume'), true)
        if (pausedBy === me) return said(t('ring.pausedByYou'))
        if (pausedBy) return said(t('ring.pausedBy', { name: nameOf(pausedBy) }))
        return said(t('ring.paused'))
    }
    const at = session.phaseEndsAt ? timeIn(accountTimeZone(), new Date(session.phaseEndsAt)) : ''
    if (session.phase !== 'focus') return said(t('ring.focusAgain', { time: at }))
    const next = nextPhaseOf(session) as 'short_break' | 'long_break'
    return said(t('ring.cycle', { round: roundOf(session), next: t(`next.${next}`), time: at }))
}
