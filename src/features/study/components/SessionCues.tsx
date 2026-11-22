import { useTranslation } from 'react-i18next'
import { useTitleClock } from '@/hooks/useDocumentTitle'
import { usePhaseSound } from '../hooks/usePhaseSound'
import { useSessionClock } from '../hooks/useSessionClock'
import { useStreakToast } from '../hooks/useStreakToast'
import { tabText } from '../lib/phase-words'
import type { AnySession } from '../types'

/**
 * What the session one is in does outside the room's page, on every page
 * (REQ-STUDY-06, STUDY-07, 07 S-ROOM-05): the tab's title counts it down
 * ("(2) 18:42 · Tập trung · NezFocus"; paused, the number still), the phase
 * sound plays as a phase begins (D-140), and the streak toast says when
 * today reaches 15 minutes (D-232). Draws nothing; mounted by the shell
 * while the room it is in has a session, so only it re-renders each second.
 */
export default function SessionCues({ session }: { session: AnySession }) {
    const { t } = useTranslation()
    const now = useSessionClock(session)
    useTitleClock(tabText(t, session, now))
    usePhaseSound(session)
    useStreakToast(session, now)
    return null
}
