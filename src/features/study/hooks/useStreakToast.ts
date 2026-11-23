import { createElement, useEffect, useRef } from 'react'
import { Flame } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { accountTimeZone } from '@/lib/time-zones'
import { useStudyToday } from '../api/useStudyToday'
import { dayStartOf, STREAK_DAY_SECONDS, streakShown, todaySecondsAt } from '../lib/today'
import type { AnySession } from '../types'

/** One streak toast at a time in this tab, whichever moment says it. */
const STREAK_TOAST_ID = 'study-streak'

/**
 * "Đủ 15 phút hôm nay · chuỗi 6 ngày liên tiếp" with the icon `flame` (07
 * edge `streak-reached`, STUDY-07, D-232) the moment one's minutes today,
 * as they run in the session one is in (D-224), reach 15; on every page,
 * in the shell's words. Not for a day already past 15 when the session or
 * the page opened; again on a new day. Once a day: a phase's end comes
 * before its count (two events, D-232), so for a moment the number drops
 * back below 15 and climbs past it again; that is not reaching it.
 */
export function useStreakToast(session: AnySession, now: number): void {
    const { t } = useTranslation()
    const today = useStudyToday().data
    const dayStart = dayStartOf(now, accountTimeZone())
    const seconds = today ? todaySecondsAt(today, session, now, dayStart) : null
    const before = useRef<number | null>(null)
    // The day (its start) on which this mount saw 15 minutes reached.
    const reached = useRef<number | null>(null)

    useEffect(() => {
        if (seconds === null || !today) return
        const was = before.current
        before.current = seconds
        if (seconds < STREAK_DAY_SECONDS) return
        const seen = reached.current === dayStart
        reached.current = dayStart
        if (was === null || was >= STREAK_DAY_SECONDS || seen) return
        toast(t('shell.study.streakReached', { count: streakShown(today, session, now, dayStart) }), {
            id: STREAK_TOAST_ID,
            icon: createElement(Flame, { className: 'size-4', 'aria-hidden': true })
        })
    }, [seconds, today, session, now, dayStart, t])
}
