import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { studiedText } from '../lib/durations'
import { phaseMinutes } from '../lib/phases'
import type { AnySession } from '../types'

/**
 * What to read out politely as the room's session moves to another phase
 * (07 S-ROOM-02 › Tương tác: `aria-live` "Chuyển sang Nghỉ ngắn, 5 phút"),
 * by itself or skipped; nothing for the phase found on opening the page.
 */
export function usePhaseNews(session: AnySession | null): string {
    const { t } = useTranslation('study')
    const [shown, setShown] = useState({ id: session?.id, index: session?.phaseIndex })
    const [said, setSaid] = useState('')
    // Kept while rendering (react.dev, "storing information from previous renders").
    if (session && (shown.id !== session.id || shown.index !== session.phaseIndex)) {
        if (shown.id === session.id)
            setSaid(
                t('ring.switched', {
                    phase: t(`phase.${session.phase}`),
                    time: studiedText(t, phaseMinutes(session) * 60)
                })
            )
        setShown({ id: session.id, index: session.phaseIndex })
    }
    return said
}
