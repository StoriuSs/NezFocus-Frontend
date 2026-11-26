import { lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import type { DockShape } from '@/components/shell/DockFrame'
import { LIST_SHOWS, useMediaQuery } from '@/hooks/useMediaQuery'
import { useCallStore } from '../../call.store'
import { isDmPage } from '../../lib/paths'

const CallDock = lazy(() => import('./CallDock'))

/**
 * The dock of this tab's call (C-09 `call`), over the Solo's when both
 * show; none on the call's own page, its DM (09 › InRoomDock: one clock
 * counting seconds a screen). `column` from 1024 up, `strip` below; the
 * other draws nothing, as the room's dock.
 */
export function CallDockSlot({ shape }: { shape: DockShape }) {
    const tab = useCallStore((state) => state.current)
    const wide = useMediaQuery(LIST_SHOWS)
    const { pathname } = useLocation()
    if (!tab || wide !== (shape === 'column')) return null
    if (isDmPage(pathname, tab.call.dmId)) return null
    return (
        <Suspense fallback={null}>
            <CallDock tab={tab} shape={shape} />
        </Suspense>
    )
}
