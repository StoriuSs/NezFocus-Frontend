import { Trans, useTranslation } from 'react-i18next'
import '@/i18n/study'
import '../study.css'
import mascotNeutral from '@/assets/mascot/runtime-neutral-240.webp'
import { Mascot } from '@/components/brand/mascot/Mascot'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { accountTimeZone } from '@/lib/time-zones'
import { useStudyToday } from '../api/useStudyToday'
import { useStudyWeek } from '../api/useStudyWeek'
import { useNewDay } from '../hooks/useNewDay'
import { useSessionClock } from '../hooks/useSessionClock'
import { studiedText } from '../lib/durations'
import { dayStartOf, streakShown, todaySecondsAt } from '../lib/today'
import { dateKeyAt, isMilestoneDay, weekBars, weekTotal } from '../lib/week'
import type { AnySession } from '../types'
import { ALWAYS, CheerBlock } from './CheerBlock'
import { SECTION_TITLE, StreakBlock } from './StreakBlock'
import { WeekChart } from './WeekChart'

/**
 * The Study page's streak and week (C-45 StudyStats, 08 S-STUDY-01):
 * "CHUỖI NGÀY HỌC", the streak in big numbers, "Dài nhất 14 ngày" (0:
 * "Học 15 phút hôm nay để bắt đầu chuỗi mới · Dài nhất 14 ngày"), today's
 * progress to 15 minutes, then "TUẦN NÀY · 4 giờ 35 phút" and its chart.
 * Today's minutes, its column and the week's total grow each minute of
 * focus in the session one is in (`session`: the room's, or the Solo);
 * the streak goes up as today reaches 15 minutes (D-224). On a milestone
 * day (7, 30, 100, 365) Runtime cheers at the top; never studied, Runtime
 * neutral says how to begin, in place of the numbers. "Xem thống kê ›"
 * opens the Stats page (08 S-STUDY-03).
 */
export default function StudyStats({ session }: { session: AnySession | null }) {
    const { t } = useTranslation('study')
    const { t: tCommon } = useTranslation()
    const sessionNow = useSessionClock(session)
    const dayNow = useNewDay()
    const now = Math.max(sessionNow, dayNow)
    const zone = accountTimeZone()
    const today = useStudyToday()
    const week = useStudyWeek(dateKeyAt(now, zone))
    const heading = <h2 className={SECTION_TITLE}>{t('overview.stats.streakTitle')}</h2>

    // Only a first read failing: a read again failing keeps what was read (data-fetching.md).
    if ((today.isError && !today.data) || (week.isError && !week.data)) {
        return (
            <section className='flex flex-col items-start gap-2'>
                {heading}
                <p className='text-label text-text-secondary'>{t('overview.stats.error')}</p>
                <Button
                    type='button'
                    variant='text'
                    size='sm'
                    onClick={() => {
                        if (today.isError) void today.refetch()
                        if (week.isError) void week.refetch()
                    }}
                >
                    {tCommon('buttons.tryAgain')}
                </Button>
            </section>
        )
    }
    if (!today.data || !week.data) {
        return (
            <section aria-busy='true' className='flex flex-col gap-3'>
                {heading}
                <Skeleton className='h-10 w-40 rounded-badge bg-surface-2' />
                <Skeleton className='h-5 w-48 rounded-badge bg-surface-2' />
                <Skeleton className='mt-4 h-32 w-full rounded-badge bg-surface-2' />
            </section>
        )
    }

    const dayStart = dayStartOf(now, zone)
    const todaySeconds = todaySecondsAt(today.data, session, now, dayStart)
    if (week.data.firstDate === null && todaySeconds === 0) {
        return (
            <section className='flex flex-col gap-4'>
                {heading}
                <EmptyState
                    className='max-w-none items-start text-left'
                    mascot={<Mascot mood='neutral' size={96} still={mascotNeutral} loadWhen={ALWAYS} />}
                    title={t('overview.stats.neverTitle')}
                >
                    {t('overview.stats.neverBody')}
                </EmptyState>
            </section>
        )
    }

    const streak = streakShown(today.data, session, now, dayStart)
    const longest = Math.max(week.data.longest, streak)
    const bars = weekBars(week.data, todaySeconds)
    return (
        <section className='flex flex-col'>
            {isMilestoneDay(streak, todaySeconds) ? (
                <CheerBlock>{t('overview.stats.milestone', { count: streak })}</CheerBlock>
            ) : null}
            <StreakBlock streak={streak} longest={longest} todaySeconds={todaySeconds} linked />
            <h2 className='mt-8 text-label font-semibold text-text-tertiary'>
                <Trans
                    t={t}
                    i18nKey='overview.stats.weekTitle'
                    values={{ time: studiedText(t, weekTotal(bars)) }}
                    components={[<span key='label' className='uppercase' />]}
                />
            </h2>
            <WeekChart bars={bars} today={week.data.today} />
        </section>
    )
}
