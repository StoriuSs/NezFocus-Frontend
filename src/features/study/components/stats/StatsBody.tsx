import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import '../../study.css'
import mascotConfused from '@/assets/mascot/runtime-confused-192.webp'
import mascotNeutral from '@/assets/mascot/runtime-neutral-240.webp'
import { Mascot } from '@/components/brand/mascot/Mascot'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useStartSolo } from '../../api/useSolo'
import { useStatsView } from '../../hooks/useStatsView'
import { isMilestoneDay } from '../../lib/week'
import type { StatsPeriod } from '../../lib/periods'
import { CYCLE_PRESETS } from '../../lib/study-cycle'
import type { AnySession } from '../../types'
import { ALWAYS, CheerBlock } from '../CheerBlock'
import { StreakBlock } from '../StreakBlock'
import { PeriodChart } from './PeriodChart'
import { PeriodTotals } from './PeriodTotals'
import { SessionHistory } from './SessionHistory'
import { StreakGrid } from './StreakGrid'

/** The first focus the empty page offers (08 S-STUDY-03 `empty`): 25/5, no long break. */
const FIRST_CYCLE = { ...CYCLE_PRESETS['25/5'], longBreak: null, longBreakEvery: null }

/**
 * The Stats page's body (08 S-STUDY-03, D-104, D-105, D-235): on the left
 * the period's chart or month and its split, then the history; on the
 * right Runtime cheering (a streak milestone first, else one's best week),
 * the streak and today's progress (always now's), the period's numbers, the
 * lifetime total and, viewing a week, the 4-week grid ending on it. Two
 * columns from a 1320 window as the Study page; below, one in the order
 * numbers, chart, history, grid. Never studied, nothing today, in no
 * session: Runtime neutral says how to begin, its button starting a 25/5
 * Solo. Loading: Skeleton; the first read failing: Runtime confused and
 * "Thử lại" (a read again failing keeps the numbers).
 */
export default function StatsBody({
    period,
    joined,
    solo
}: {
    period: StatsPeriod
    joined: AnySession | null
    solo: AnySession | null
}) {
    const { t } = useTranslation('study')
    const { t: tCommon } = useTranslation()
    const { now, zone, today, day, stats, view } = useStatsView(period, joined, solo)
    const start = useStartSolo()

    if (!view && ((day.isError && !day.data) || (stats.isError && !stats.data))) {
        return (
            <EmptyState
                className='m-auto py-8'
                mascot={<Mascot mood='confused' size={96} still={mascotConfused} loadWhen={ALWAYS} />}
                title={t('overview.stats.error')}
                actions={
                    <Button
                        type='button'
                        variant='outline'
                        onClick={() => {
                            if (day.isError) void day.refetch()
                            if (stats.isError) void stats.refetch()
                        }}
                    >
                        {tCommon('buttons.tryAgain')}
                    </Button>
                }
            >
                {t('stats.errorBody')}
            </EmptyState>
        )
    }
    if (!view) {
        return (
            <div aria-busy='true' className={LAYOUT}>
                <div className={`flex flex-col gap-3 ${RIGHT}`}>
                    <Skeleton className='h-10 w-40 rounded-badge bg-surface-2' />
                    <Skeleton className='h-5 w-48 rounded-badge bg-surface-2' />
                    <Skeleton className='mt-4 h-16 w-full rounded-badge bg-surface-2' />
                </div>
                <div className={`flex flex-col gap-3 ${LEFT}`}>
                    <Skeleton className='h-32 w-full rounded-badge bg-surface-2' />
                    {[0, 1, 2, 3].map((key) => (
                        <Skeleton key={key} className='h-10 w-full rounded-badge bg-surface-2' />
                    ))}
                </div>
            </div>
        )
    }
    if (view.empty) {
        return (
            <EmptyState
                className='m-auto py-8'
                mascot={<Mascot mood='neutral' size={96} still={mascotNeutral} loadWhen={ALWAYS} />}
                title={t('overview.stats.neverTitle')}
                actions={
                    <Button
                        type='button'
                        variant='outline'
                        aria-busy={start.isPending}
                        onClick={() => {
                            if (!start.isPending) start.mutate(FIRST_CYCLE)
                        }}
                    >
                        {t('ring.start', { count: FIRST_CYCLE.focus })}
                    </Button>
                }
            >
                {t('overview.stats.neverBody')}
            </EmptyState>
        )
    }

    const { numbers } = view
    const milestone = isMilestoneDay(view.streak, view.todaySeconds)
    return (
        <div className={LAYOUT}>
            <div className={`flex flex-col gap-6 ${RIGHT}`}>
                {milestone ? (
                    <CheerBlock>{t('overview.stats.milestone', { count: view.streak })}</CheerBlock>
                ) : numbers.best ? (
                    <CheerBlock>{t('stats.record')}</CheerBlock>
                ) : null}
                <StreakBlock streak={view.streak} longest={view.longest} todaySeconds={view.todaySeconds} />
                <PeriodTotals period={period} numbers={numbers} today={today} />
            </div>
            <div className={`flex flex-col gap-8 ${LEFT}`}>
                <PeriodChart period={period} numbers={numbers} today={today} />
                <SessionHistory
                    period={period}
                    session={view.session}
                    today={today}
                    day={day.data}
                    now={now}
                    todaySeconds={view.todaySeconds}
                    timeZone={zone}
                />
            </div>
            {numbers.grid ? (
                <div className={GRID}>
                    <StreakGrid days={numbers.grid} today={today} />
                </div>
            ) : null}
        </div>
    )
}

/** One column at most 720 wide; from a 1320 window 600 + 336, 24 apart (as the Study page). */
const LAYOUT =
    'flex max-w-[720px] flex-col gap-8 p-6 lg:p-8 min-[1320px]:grid min-[1320px]:max-w-none min-[1320px]:grid-cols-[600px_336px] min-[1320px]:grid-rows-[auto_1fr] min-[1320px]:items-start min-[1320px]:gap-x-6'
const RIGHT = 'min-w-0 min-[1320px]:col-start-2 min-[1320px]:row-start-1'
const LEFT = 'min-w-0 min-[1320px]:col-start-1 min-[1320px]:row-span-2 min-[1320px]:row-start-1'
const GRID = 'min-w-0 min-[1320px]:col-start-2 min-[1320px]:row-start-2'
