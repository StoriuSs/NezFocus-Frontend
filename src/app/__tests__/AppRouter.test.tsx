import { lazy, Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppRouter } from '../AppRouter'

/** A module still on its way: resolved when the test says. */
function arriving<T>() {
    let arrive!: (value: T) => void
    const promise = new Promise<T>((resolve) => (arrive = resolve))
    return { promise, arrive }
}

/** As ServerSettingsPage: without a section, its first one. */
function Settings() {
    const { section } = useParams()
    if (!section) return <Navigate to='/settings/overview' replace />
    return <p>settings {section}</p>
}

describe('AppRouter', () => {
    // M3 A3 #8 (e2e notifications "a handed server..."): the settings page, still loading when a
    // channel was opened, showed late for the address already left, and its redirect took one back.
    it('lets no page shown late, for an address already left, take one back with its redirect', async () => {
        const settingsModule = arriving<{ default: typeof Settings }>()
        const columnModule = arriving<{ default: () => React.JSX.Element }>()
        const SettingsPage = lazy(() => settingsModule.promise)
        // Outside the page's own Suspense, as the shell's column is: it holds the channel back.
        const ChannelColumn = lazy(() => columnModule.promise)

        function Shell() {
            const { pathname } = useLocation()
            return (
                <>
                    {pathname.startsWith('/channels') ? <ChannelColumn /> : null}
                    {/* As AppShell: a page's own Suspense, new with each address. */}
                    <main key={pathname}>
                        <Suspense fallback={<p>loading</p>}>
                            <Outlet />
                        </Suspense>
                    </main>
                </>
            )
        }
        const router = createMemoryRouter(
            [
                {
                    element: (
                        <Suspense fallback={<p>loading the shell</p>}>
                            <Shell />
                        </Suspense>
                    ),
                    children: [
                        { path: '/study', element: <p>study</p> },
                        { path: '/settings/:section?', element: <SettingsPage /> },
                        { path: '/channels', element: <p>channel</p> }
                    ]
                }
            ],
            { initialEntries: ['/study'] }
        )
        render(<AppRouter router={router} />)
        expect(screen.getByText('study')).toBeInTheDocument()

        await act(async () => void router.navigate('/settings'))
        await act(async () => void router.navigate('/channels'))
        await act(async () => settingsModule.arrive({ default: Settings }))
        await act(async () => columnModule.arrive({ default: () => <p>channel list</p> }))

        expect(router.state.location.pathname).toBe('/channels')
        expect(await screen.findByText('channel')).toBeInTheDocument()
        expect(screen.getByText('channel list')).toBeInTheDocument()
        expect(screen.queryByText(/settings/)).not.toBeInTheDocument()
    })
})
