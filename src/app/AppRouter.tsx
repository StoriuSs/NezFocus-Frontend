import { RouterProvider, type DataRouter } from 'react-router-dom'

/**
 * The app's routes on screen, each move drawn at once, not as a transition
 * (`useTransitions={false}`). As a transition, a page still loading when one
 * moved on could still show, late, for the address left, and run its effects
 * there: its redirect then took one back (M3 A3, docs/code-splitting.md).
 */
export function AppRouter({ router }: { router: DataRouter }) {
    return <RouterProvider router={router} useTransitions={false} />
}
