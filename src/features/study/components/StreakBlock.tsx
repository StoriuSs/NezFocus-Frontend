import { ChevronRight, Flame } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { Button } from '@/components/ui/button'
import { studiedText } from '../lib/durations'
import { STATS_PATH } from '../lib/periods'
import { STREAK_DAY_SECONDS } from '../lib/today'

export const SECTION_TITLE = 'text-label font-semibold uppercase text-text-tertiary'

/**
 * The streak part of C-45, on the Study page and the Stats page: "CHUỖI NGÀY
 * HỌC", the streak in big numbers, "Dài nhất 14 ngày" (0: "Học 15 phút hôm
 * nay để bắt đầu chuỗi mới · Dài nhất 14 ngày"), then today's progress to
 * 15 minutes, its label saying the minutes so it reads without colour; on
 * the Study page "Xem thống kê ›" under it (`linked`).
 */
export function StreakBlock({
    streak,
    longest,
    todaySeconds,
    linked = false
}: {
    streak: number
    longest: number
    todaySeconds: number
    linked?: boolean
}) {
    const { t } = useTranslation('study')
    const reached = todaySeconds >= STREAK_DAY_SECONDS
    const todayMinutes = Math.floor(todaySeconds / 60)
    return (
        <div className='flex flex-col'>
            <h2 className={SECTION_TITLE}>{t('overview.stats.streakTitle')}</h2>
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
            {linked ? (
                // Under the progress, flush with the words above it (frame `B8erW`).
                <Button asChild variant='link' size='sm' className='mt-1 w-fit p-0'>
                    <Link to={STATS_PATH}>
                        {t('overview.stats.seeStats')}
                        <ChevronRight aria-hidden='true' />
                    </Link>
                </Button>
            ) : null}
        </div>
    )
}
