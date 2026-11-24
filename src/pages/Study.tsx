import { Suspense, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShellPage } from '@/components/shell/ShellPage'
import { LiveRooms, NoServers, useServers, useStudyingRoom } from '@/features/servers'
import { SoloCard, StudyStats, useSoloSession } from '@/features/study'
import { useProfile } from '@/features/users'

/** Set by the welcome page when the account has just been completed (01 S-ONB-01). */
export interface StudyPageState {
    firstVisit?: boolean
}

/**
 * The Study page, the app's home after sign-in (D-124; 08 S-STUDY-01, a
 * Read page: left-aligned, at most 960 wide, 32 in). Two columns from a
 * content area of 1008 (a 1320 window): the rooms studying now (600) and,
 * 24 apart, the Solo block over the streak and week (336); below, one
 * column at most 720 wide in the same reading order: who is studying, then
 * studying alone, then the numbers. In no server the rooms' part says so
 * and offers to create one (`no-server`); right after the account is
 * completed, the whole page greets them instead (02 S-SHELL-01
 * `no-server-first`, D-124).
 */
export default function Study() {
    const { t } = useTranslation()
    const { state } = useLocation() as { state: StudyPageState | null }
    const navigate = useNavigate()
    // Greeted once: the browser keeps a page's state across a reload, so it is
    // read here and taken off the history entry.
    const [first] = useState(state?.firstVisit === true)
    const servers = useServers()
    const profile = useProfile()
    // In this tab's room or another's (D-236).
    const studying = useStudyingRoom()
    const solo = useSoloSession().data?.session ?? null

    useEffect(() => {
        if (state?.firstVisit) void navigate('.', { replace: true, state: null })
    }, [navigate, state])

    // Right after the account is completed, nothing until the servers say whether to greet.
    if (first && servers.isPending) return <ShellPage title={t('shell.study.title')} />
    if (first && servers.data?.length === 0) {
        return (
            <ShellPage title={t('shell.study.title')}>
                <NoServers name={profile.data?.displayName ?? undefined} />
            </ShellPage>
        )
    }
    return (
        <ShellPage title={t('shell.study.title')}>
            <div className='flex max-w-[720px] flex-col gap-8 p-6 lg:p-8 min-[1320px]:grid min-[1320px]:max-w-none min-[1320px]:grid-cols-[600px_336px] min-[1320px]:items-start min-[1320px]:gap-x-6'>
                <div className='min-w-0'>
                    <Suspense fallback={null}>
                        <LiveRooms />
                    </Suspense>
                </div>
                <div className='flex min-w-0 flex-col gap-8'>
                    <Suspense fallback={null}>
                        <SoloCard inRoom={studying?.name ?? null} />
                    </Suspense>
                    <Suspense fallback={null}>
                        <StudyStats session={studying?.session ?? solo} />
                    </Suspense>
                </div>
            </div>
        </ShellPage>
    )
}
