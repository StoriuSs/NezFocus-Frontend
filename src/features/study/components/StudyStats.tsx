import { Flame } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import '@/i18n/study'
import '../study.css'
import mascotHappy from '@/assets/mascot/runtime-happy-320.webp'
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
import { dayStartOf, STREAK_DAY_SECONDS, streakShown, todaySecondsAt } from '../lib/today'
import { dateKeyAt, isMilestoneDay, weekBars, weekTotal } from '../lib/week'
import type { AnySession } from '../types'
import { WeekChart } from './WeekChart'

/** Runtime is in view whenever this block is: load its animation at any width. */
const ALWAYS = '(min-width: 0px)'

const SECTION_TITLE = 'text-label font-semibold uppercase text-text-tertiary'

/**
 * The Study page's streak and week (C-45 StudyStats, 08 S-STUDY-01):
 * "CHUỖI NGÀY HỌC", the streak in big numbers, "Dài nhất 14 ngày" (0:
 * "Học 15 phút hôm nay để bắt đầu chuỗi mới · Dài nhất 14 ngày"), today's
 * progress to 15 minutes, then "TUẦN NÀY · 4 giờ 35 phút" and its chart.
 * Today's minutes, its column and the week's total grow each minute of
 * focus in the session one is in (`session`: the room's, or the Solo);
 * the streak goes up as today reaches 15 minutes (D-224). On a milestone
 * day (7, 30, 100, 365) Runtime cheers at the top; never studied, Runtime
 * neutral says how to begin, in place of the numbers. "Xem thống kê" comes
 * with the stats page (L8).
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
    const reached = todaySeconds >= STREAK_DAY_SECONDS
    const todayMinutes = Math.floor(todaySeconds / 60)
    return (
        <section className='flex flex-col'>
            {isMilestoneDay(streak, todaySeconds) ? (
                <div className='mb-6 flex items-center gap-4'>
                    <Mascot mood='happy' size={120} still={mascotHappy} loadWhen={ALWAYS} className='shrink-0' />
                    <p className='text-headline font-semibold text-text-primary'>
                        {t('overview.stats.milestone', { count: streak })}
                    </p>
                </div>
            ) : null}
            {heading}
            <p className='mt-2 flex items-center gap-2'>
                <span className='sr-only'>{t('overview.stats.streakLabel', { count: streak })}</span>
                <Flame className='size-5 shrink-0 text-text-primary' aria-hidden='true' />
                <span aria-hidden='true' className='font-numeric text-stat text-text-primary'>
                    {streak}
                </span>
                <span aria-hidden='true' className='text-body text-text-primary'>
                    {t('overview.stats.days', { count: streak })}
                </span>
            </p>
            <p className='mt-1 text-label text-text-secondary'>
                {streak === 0
                    ? `${t('overview.stats.startNew')} · ${t('overview.stats.longest', { count: longest })}`
                    : t('overview.stats.longest', { count: longest })}
            </p>
            <p className='mt-4 text-label text-text-secondary'>
                {reached
                    ? t('overview.stats.todayDone', { time: studiedText(t, todaySeconds) })
                    : t('overview.stats.todayShort', { count: todayMinutes })}
            </p>
            <div
                role='progressbar'
                aria-valuemin={0}
                aria-valuemax={15}
                aria-valuenow={Math.min(15, todayMinutes)}
                aria-label={t('overview.stats.todayShort', { count: Math.min(15, todayMinutes) })}
                className='mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2'
            >
                <div
                    className='h-full rounded-full bg-primary'
                    style={{ width: `${Math.min(100, (todaySeconds / STREAK_DAY_SECONDS) * 100)}%` }}
                />
            </div>
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
