import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { settingsCache } from '@/features/users'
import { playPhaseSound } from '@/lib/phase-sound'
import { serverNow } from '@/lib/server-clock'
import type { AnySession } from '../types'

/** How late after a phase began its sound still plays: a later word of it is a catch-up (07 › Edge). */
export const PHASE_SOUND_GRACE_MS = 5000

/**
 * The phase sound (REQ-STUDY-06, D-140) as the session moves to another
 * phase, by itself or skipped, when the account has it on (`phaseSound`,
 * D-37). Not for the phase found on mounting (a reload, joining), nor for
 * one that began more than a few seconds ago on the server's clock: a tab
 * asleep over several phases, or back after a lost connection, plays no
 * catch-up (07 › Edge, NFR-REL-01). Not as a session starts or ends: neither
 * is a change of phase.
 *
 * `shared`: a session every tab of the person follows (a Solo, D-222), so
 * only the tab that takes the phase's lock first plays (`navigator.locks`,
 * held past the grace): two tabs in the background do not sound twice. A
 * room's session plays in the one tab in the room.
 */
export function usePhaseSound(session: AnySession, { shared = false }: { shared?: boolean } = {}): void {
    const on = useQuery(settingsCache).data?.phaseSound ?? true
    const heard = useRef({ id: session.id, index: session.phaseIndex })
    const { id, phaseIndex, phaseStartedAt } = session

    useEffect(() => {
        const before = heard.current
        heard.current = { id, index: phaseIndex }
        if (before.id !== id || before.index === phaseIndex) return
        if (!on || serverNow() - Date.parse(phaseStartedAt) > PHASE_SOUND_GRACE_MS) return
        if (!shared || typeof navigator === 'undefined' || !navigator.locks) return playPhaseSound()
        void navigator.locks.request(`phase-sound-${id}-${phaseIndex}`, { ifAvailable: true }, async (lock) => {
            if (!lock) return
            playPhaseSound()
            // Held past the grace: a tab waking later has let the phase go by then.
            await new Promise((resolve) => setTimeout(resolve, PHASE_SOUND_GRACE_MS * 2))
        })
    }, [id, phaseIndex, phaseStartedAt, on, shared])
}
