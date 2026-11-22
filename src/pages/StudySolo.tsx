import { Suspense } from 'react'
import { Timer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PageLoader } from '@/components/PageLoader'
import { ShellPage } from '@/components/shell/ShellPage'
import { useJoinedSession } from '@/features/servers'
import { SoloStage, useSoloSession } from '@/features/study'
import { RoomControl, useVoiceStore } from '@/features/voice'
import { PHASE_ROOM } from '@/lib/phase-colors'

/**
 * The Solo page, `/study/solo` (08 S-STUDY-02): a Header like a room's
 * (`timer` and "Học một mình", nothing else yet: the floating window is
 * M7), the stage of one's Solo, its ground the phase's while it runs or is
 * paused (`phase-*-room`, crossfading as the phase changes), `bg` otherwise.
 * Opened with no Solo it is its start (`idle`); in a room's session, why no
 * Solo starts (REQ-STUDY-05).
 */
export default function StudySolo() {
    const { t } = useTranslation()
    const session = useSoloSession().data?.session ?? null
    const joined = useJoinedSession()
    const room = useVoiceStore((state) => state.call?.name ?? null)
    const ground = session && session.status !== 'waiting' ? PHASE_ROOM[session.phase] : null
    return (
        <ShellPage
            title={t('shell.study.solo')}
            icon={Timer}
            bodyClassName='flex flex-col'
            className={
                ground
                    ? `${ground} transition-colors duration-long ease-in-out motion-reduce:duration-short`
                    : undefined
            }
        >
            <Suspense fallback={<PageLoader className='min-h-0 flex-1' />}>
                <SoloStage Control={RoomControl} inRoom={joined ? room : null} />
            </Suspense>
        </ShellPage>
    )
}
