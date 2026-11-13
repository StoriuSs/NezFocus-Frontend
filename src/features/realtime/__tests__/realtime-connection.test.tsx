import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import '@/i18n'
import { ShellPage } from '@/components/shell/ShellPage'
import { ShellContext } from '@/components/shell/shell-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { expectNoA11yViolations } from '@/test/a11y'
import type { SocketOptions } from '@/lib/socket'

let opened: SocketOptions | undefined
const closeSocket = vi.fn()
vi.mock('@/lib/socket', () => ({
    openSocket: (options: SocketOptions) => {
        opened = options
        return closeSocket
    }
}))
const fetchRealtimeTicket = vi.fn(async () => 'ticket-1')
vi.mock('@/features/realtime/api/realtime.api', () => ({ fetchRealtimeTicket }))
const auth = { isAuthenticated: true, refreshToken: vi.fn(async (): Promise<string | undefined> => undefined) }
vi.mock('@/features/auth', () => ({ useAuthStore: { getState: () => auth } }))

const { useRealtimeConnection } = await import('../hooks/useRealtimeConnection')
const { endSession } = await import('../lib/session-end')
const { useConnectionBanner } = await import('../hooks/useConnectionBanner')
const { useRealtimeStore } = await import('../realtime.store')
const { onRealtimeEvent } = await import('../lib/realtime-events')

function Shell() {
    useRealtimeConnection()
    const connection = useConnectionBanner()
    return <output>{connection ?? 'none'}</output>
}

/** Once the timer that waits for the first paint has fired, and the import() resolved. */
const afterFirstPaint = () => waitFor(() => expect(opened).toBeDefined())

describe('The AppShell socket', () => {
    beforeEach(() => {
        opened = undefined
        closeSocket.mockClear()
        auth.refreshToken.mockClear()
        auth.isAuthenticated = true
        useRealtimeStore.getState().reset()
    })
    afterEach(() => vi.useRealTimers())

    it('opens after the first paint, at the API origin, buying tickets over REST; closes when the shell goes', async () => {
        const { unmount } = render(<Shell />)
        expect(opened).toBeUndefined()

        await afterFirstPaint()
        expect(new URL(opened!.url).pathname).toBe('/')
        expect(opened!.getTicket).toBe(fetchRealtimeTicket)

        act(() => opened!.onStatus('connected'))
        expect(useRealtimeStore.getState().socket).toBe('connected')

        unmount()
        expect(closeSocket).toHaveBeenCalledTimes(1)
        expect(useRealtimeStore.getState().socket).toBe('idle')
    })

    it('hands what the socket hears to the listeners, and tells them each time it is live again', async () => {
        const created = vi.fn()
        const ready = vi.fn()
        const stops = [onRealtimeEvent('message.created', created), onRealtimeEvent('ready', ready)]
        render(<Shell />)
        await afterFirstPaint()

        act(() => opened!.onStatus('connected'))
        act(() => opened!.onEvent?.('message.created', { nonce: 'n1' }))
        act(() => opened!.onStatus('down'))
        act(() => opened!.onStatus('connected'))

        expect(created).toHaveBeenCalledWith({ nonce: 'n1' })
        expect(ready).toHaveBeenCalledTimes(2)
        stops.forEach((stop) => stop())
    })
    it('shows reconnecting once the socket has been down 3 seconds, and nothing once it is back', async () => {
        render(<Shell />)
        await afterFirstPaint()

        vi.useFakeTimers()
        act(() => opened!.onStatus('down'))
        expect(screen.getByRole('status')).toHaveTextContent('none')
        act(() => void vi.advanceTimersByTime(3000))
        expect(screen.getByRole('status')).toHaveTextContent('reconnecting')

        act(() => opened!.onStatus('connected'))
        expect(screen.getByRole('status')).toHaveTextContent('none')
    })

    it('shows offline while the browser has no network', async () => {
        render(<Shell />)
        act(() => void window.dispatchEvent(new Event('offline')))
        expect(screen.getByRole('status')).toHaveTextContent('offline')
        act(() => void window.dispatchEvent(new Event('online')))
        expect(screen.getByRole('status')).toHaveTextContent('none')
    })

    it('asks why when the API ends the session: over (signed out with the reason), or still signed in (D-74)', async () => {
        await expect(endSession()).resolves.toBe(false)
        expect(auth.refreshToken).toHaveBeenCalledTimes(1)

        auth.refreshToken.mockResolvedValueOnce('new-access-token')
        await expect(endSession()).resolves.toBe(true)
    })

    it('asks nothing once signed out', async () => {
        auth.isAuthenticated = false
        await expect(endSession()).resolves.toBe(false)
        expect(auth.refreshToken).not.toHaveBeenCalled()
    })
})

describe('The connection Banner under a page Header (C-16)', () => {
    const page = (connection: 'reconnecting' | 'offline' | null, composer?: boolean) => (
        <TooltipProvider>
            <ShellContext.Provider value={{ navOpen: false, toggleNav: () => undefined, connection }}>
                <ShellPage title='general' composer={composer}>
                    body
                </ShellPage>
            </ShellContext.Provider>
        </TooltipProvider>
    )

    it('says reconnecting', async () => {
        render(page('reconnecting'))
        expect(screen.getByRole('status')).toHaveTextContent('Reconnecting…')
        await expectNoA11yViolations()
    })

    it('says offline, and that messages wait only where there is a message box', async () => {
        const { rerender } = render(page('offline'))
        expect(screen.getByRole('status')).toHaveTextContent(/^You are offline$/)
        await expectNoA11yViolations()
        rerender(page('offline', true))
        expect(screen.getByRole('status')).toHaveTextContent('Messages will send when you are back online')
        await expectNoA11yViolations()
    })

    it('is not there while connected', () => {
        render(page(null))
        expect(screen.queryByRole('status')).toBeNull()
    })
})
