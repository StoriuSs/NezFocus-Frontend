import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBrowserOnline } from '@/hooks/useBrowserOnline'
import { useStudyHistory } from '../../api/useStudyHistory'
import { lineSecondsAt } from '../../lib/history'
import { dayStartOf, runningBeforeDay } from '../../lib/today'
import type { StatsPeriod } from '../../lib/periods'
import type { AnySession, StudyHistoryLine, StudyToday } from '../../types'
import { SECTION_TITLE } from '../StreakBlock'
import { SessionRow } from './SessionRow'

/**
 * "LỊCH SỬ PHIÊN" (C-47, D-105, D-230): the period's sessions, the one one
 * is in first, then the latest first, 20 at a time and "Xem thêm" for the
 * next (gone once all are in; off offline); a line met twice across pages
 * is kept once. None: "Chưa có phiên nào trong kỳ này". Loading: four rows
 * of Skeleton. The first read failing: why, and "Thử lại" (no Runtime); a
 * read again failing keeps the lines.
 */
export function SessionHistory({
    period,
    session,
    today,
    day,
    now,
    todaySeconds,
    timeZone
}: {
    period: StatsPeriod
    session: AnySession | null
    today: string
    day: StudyToday | undefined
    now: number
    /** Today's seconds now, the running focus in. */
    todaySeconds: number
    timeZone: string | undefined
}) {
    const { t } = useTranslation('study')
    const { t: tCommon } = useTranslation()
    const online = useBrowserOnline()
    const history = useStudyHistory(period)
    // A line met on two pages (left between their reads) once, where it first came, as last read.
    const byId = new Map<string, StudyHistoryLine>()
    for (const line of history.data?.pages.flatMap((page) => page.items) ?? []) byId.set(line.sessionId, line)
    const lines = [...byId.values()]
    const countedToday = history.data?.pages[0]?.countedToday ?? null
    const readDay = history.data?.pages[0]?.readDay ?? null
    const dayStart = dayStartOf(now, timeZone)
    const before = day ? runningBeforeDay(day, session, dayStart) : 0

    let body
    if (history.isError && !history.data) {
        body = (
            <div className='flex flex-col items-start gap-2'>
                <p className='text-label text-text-secondary'>{t('stats.historyError')}</p>
                <Button type='button' variant='text' size='sm' onClick={() => void history.refetch()}>
                    {tCommon('buttons.tryAgain')}
                </Button>
            </div>
        )
    } else if (!history.data) {
        body = (
            <div aria-busy='true' className='flex flex-col'>
                {[0, 1, 2, 3].map((key) => (
                    <div key={key} className='flex h-14 flex-col justify-center gap-1.5 px-2'>
                        <Skeleton className='h-4 w-64 rounded-badge bg-surface-2' />
                        <Skeleton className='h-3 w-40 rounded-badge bg-surface-2' />
                    </div>
                ))}
            </div>
        )
    } else if (lines.length === 0) {
        body = <p className='text-label text-text-secondary'>{t('stats.noSessions')}</p>
    } else {
        body = (
            <>
                <ul className='flex flex-col'>
                    {lines.map((line) => (
                        <SessionRow
                            key={line.sessionId}
                            line={line}
                            seconds={lineSecondsAt(line, {
                                countedToday,
                                todaySeconds,
                                session,
                                today: day,
                                now,
                                readDay,
                                dayStart,
                                before
                            })}
                            today={today}
                            timeZone={timeZone}
                        />
                    ))}
                </ul>
                {history.hasNextPage ? (
                    <Button
                        type='button'
                        variant='text'
                        size='sm'
                        className='mt-2 w-fit'
                        disabled={!online}
                        aria-busy={history.isFetchingNextPage}
                        onClick={() => {
                            if (!history.isFetchingNextPage) void history.fetchNextPage()
                        }}
                    >
                        {t('stats.more')}
                    </Button>
                ) : null}
            </>
        )
    }

    return (
        <section aria-labelledby='session-history-title' className='flex flex-col gap-2'>
            <h2 id='session-history-title' className={SECTION_TITLE}>
                {t('stats.history')}
            </h2>
            {body}
        </section>
    )
}
