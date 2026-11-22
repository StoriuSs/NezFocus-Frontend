import { lazy, Suspense } from 'react'
import { useMatch } from 'react-router-dom'
import type { DockShape } from '@/components/shell/DockFrame'
import { LIST_SHOWS, useMediaQuery } from '@/hooks/useMediaQuery'
import { SOLO_PATH, useSoloSession } from '../api/useSoloSession'

const SoloDock = lazy(() => import('./SoloDock'))

/**
 * The Solo's dock (C-09 `solo`, `solo-waiting`) while one runs, under a
 * room's dock when both show (D-103); none on the Solo page itself (08 ›
 * Quy ước). `column` from 1024 up, `strip` below; the other draws nothing,
 * as the room's dock (a hidden strip would still hold the toasts' edge).
 */
export function SoloDockSlot({ shape }: { shape: DockShape }) {
    const session = useSoloSession().data?.session ?? null
    const wide = useMediaQuery(LIST_SHOWS)
    const onSoloPage = useMatch(SOLO_PATH) !== null
    if (!session || onSoloPage || wide !== (shape === 'column')) return null
    return (
        <Suspense fallback={null}>
            <SoloDock session={session} shape={shape} />
        </Suspense>
    )
}
