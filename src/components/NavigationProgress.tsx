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
 * This provides visual feedback when React 18's concurrent transitions
 * keep the old page visible (which hides Suspense fallbacks).
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
