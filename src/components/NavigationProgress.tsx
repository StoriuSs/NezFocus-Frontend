import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
import './nprogress-custom.css'

// Configure NProgress
NProgress.configure({
    showSpinner: false,
    trickleSpeed: 200,
    minimum: 0.08
})

/**
 * Shows a subtle loading bar at the top during route navigation.
 * A sign of each move; the router no longer keeps the old page on screen as
 * a transition (src/app/AppRouter.tsx), so a page not loaded yet also shows
 * its Suspense fallback.
 */
export function NavigationProgress() {
    const location = useLocation()
    const navigationType = useNavigationType()

    useEffect(() => {
        // Only show for navigations (not initial pop/replace)
        if (navigationType === 'PUSH') {
            NProgress.start()
        }

        // Complete the progress bar
        const timer = setTimeout(() => {
            NProgress.done()
        }, 100)

        return () => {
            clearTimeout(timer)
            NProgress.done()
        }
    }, [location, navigationType])

    return null
}
