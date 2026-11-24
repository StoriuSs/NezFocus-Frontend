import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { ShellPage } from '@/components/shell/ShellPage'
import { useStudyingRoom } from '@/features/servers'
import { PeriodPicker, StatsBody, useSoloSession, useStatsPeriod } from '@/features/study'

/**
 * The Stats page, `/study/stats` (08 S-STUDY-03, D-104, D-105): a Read page
 * as the Study page. The period is the URL's (`?view=week&date=…`,
 * `?view=month&month=…`, this week with none); its picker sits in the
 * Header from 1024 up and under it below. The numbers grow with the session
 * one is in: a room's, in this tab or another (D-236), else one's Solo.
 */
export default function StudyStatsPage() {
    const { t } = useTranslation()
    const { period, show } = useStatsPeriod()
    const joined = useStudyingRoom()?.session ?? null
    const solo = useSoloSession().data?.session ?? null
    const picker = (className: string) => (
        <Suspense fallback={null}>
            <PeriodPicker period={period} show={show} joined={joined} solo={solo} className={className} />
        </Suspense>
    )
    return (
        <ShellPage title={t('shell.study.stats')} actions={picker('hidden lg:flex')} bodyClassName='flex flex-col'>
            {picker('px-6 pt-4 lg:hidden')}
            <Suspense fallback={null}>
                <StatsBody period={period} joined={joined} solo={solo} />
            </Suspense>
        </ShellPage>
    )
}
