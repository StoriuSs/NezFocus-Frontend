import { useEffect, useRef, type RefObject } from 'react'
import { serverNow } from '@/lib/server-clock'
import type { AnySession } from '../types'
import { PHASE_SOUND_GRACE_MS } from './usePhaseSound'

/** The seats breathe one after another, this far apart (DESIGN.md › Motion). */
export const BREATH_STEP_MS = 40
const BREATH_MS = 640
const LABEL_MS = 320
const REDUCED_MS = 200

const can = (element: Element): element is HTMLElement => typeof (element as HTMLElement).animate === 'function'

/**
 * "Cả phòng thở ra" (DESIGN.md › Motion) as the session moves to another
 * phase under one's eyes: the arc has closed and the ground crossfades by
 * itself (`duration-long` on the page); here the new phase's label
 * (`data-phase-label`) slides up 8 into place, and the seats around the ring
 * (`data-seat`) breathe one after another, 40 ms apart. The number of the
 * clock does not move.
 *
 * Like the phase sound: not for the phase found on mounting, nor for one
 * that began more than a few seconds ago (a tab asleep over several phases
 * plays no catch-up, 07 › Edge), nor while the tab is hidden. Movement
 * reduced: the label crossfades in 200 ms, the seats stay still. Played with
 * the Web Animations API, so it adds nothing to the stylesheets.
 */
export function usePhaseBreath(area: RefObject<HTMLElement | null>, session: AnySession | null): void {
    const seen = useRef(session && { id: session.id, index: session.phaseIndex })
    const id = session?.id ?? null
    const phaseIndex = session?.phaseIndex ?? null
    const phaseStartedAt = session?.phaseStartedAt ?? null

    useEffect(() => {
        const before = seen.current
        seen.current = id === null || phaseIndex === null ? null : { id, index: phaseIndex }
        if (!before || before.id !== id || before.index === phaseIndex || phaseStartedAt === null) return
        if (document.visibilityState === 'hidden') return
        if (serverNow() - Date.parse(phaseStartedAt) > PHASE_SOUND_GRACE_MS) return
        const root = area.current
        if (!root) return
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
        const label = root.querySelector('[data-phase-label]')
        if (label && can(label)) {
            label.animate(
                reduced
                    ? [{ opacity: 0 }, { opacity: 1 }]
                    : [
                          { translate: '0 8px', opacity: 0 },
                          { translate: '0 0', opacity: 1 }
                      ],
                { duration: reduced ? REDUCED_MS : LABEL_MS, easing: 'ease-out' }
            )
        }
        if (reduced) return
        // `scale` on its own: the seats keep their own transform (where they sit on the ring).
        root.querySelectorAll('[data-seat]').forEach((seat, index) => {
            if (!can(seat)) return
            seat.animate([{ scale: '1' }, { scale: '1.08' }, { scale: '1' }], {
                duration: BREATH_MS,
                delay: index * BREATH_STEP_MS,
                easing: 'ease-in-out'
            })
        })
    }, [area, id, phaseIndex, phaseStartedAt])
}
