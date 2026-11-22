import { lazy, Suspense, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { SOLO_PATH, useSoloSession } from '../api/useSoloSession'
import { useSoloEndToasts } from '../hooks/useSoloEndToasts'
import { forgetSoloEnded } from '../study.store'

const SessionCues = lazy(() => import('./SessionCues'))

/**
 * What one's Solo does on every page, mounted once by the AppShell (08
 * S-STUDY-02, D-234): while it runs, the tab's title, its phase sound (one
 * tab of the person's) and the streak toast (SessionCues, lazy); as it
 * ends, its toast (`useSoloEndToasts`). Leaving the Solo page forgets the
 * summary it showed.
 */
export function SoloWatch() {
    const session = useSoloSession().data?.session ?? null
    const onSoloPage = useLocation().pathname === SOLO_PATH
    useSoloEndToasts(onSoloPage)
    const was = useRef(onSoloPage)
    useEffect(() => {
        if (was.current && !onSoloPage) forgetSoloEnded()
        was.current = onSoloPage
    }, [onSoloPage])
    if (!session) return null
    return (
        <Suspense fallback={null}>
            <SessionCues session={session} shared />
        </Suspense>
    )
}
