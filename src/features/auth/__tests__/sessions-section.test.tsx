import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/i18n'
import { queryWrapper } from '@/test/helpers'
import type { SessionInfo } from '@/features/auth/types'

const authApi = { sessions: vi.fn(), revokeSession: vi.fn(), revokeOtherSessions: vi.fn() }
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock('@/features/auth/api/auth.api', () => ({ authApi }))
vi.mock('sonner', () => ({ toast }))

const { SessionsSection } = await import('@/features/auth/components/SessionsSection')

const yesterdayAt = (h: number, m: number) => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    d.setHours(h, m, 0, 0)
    return d.toISOString()
}

const session = (overrides: Partial<SessionInfo>): SessionInfo => ({
    id: 'session-x',
    browser: 'Chrome',
    os: 'Windows',
    device: 'desktop',
    ip: '14.231.x.x',
    lastActiveAt: new Date().toISOString(),
    signedInAt: new Date().toISOString(),
    current: false,
    ...overrides
})

const THIS = session({ id: 'this', current: true })
const SAFARI = session({
    id: 'safari',
    browser: 'Safari',
    os: 'macOS',
    ip: '113.190.x.x',
    lastActiveAt: yesterdayAt(22, 15)
})
const UNKNOWN = session({ id: 'odd', browser: null, os: null, ip: null, lastActiveAt: yesterdayAt(8, 5) })

const renderSection = () => render(<SessionsSection />, { wrapper: queryWrapper() })
const rows = async () => within(await screen.findByRole('list')).getAllByRole('listitem')

describe('the sessions on the account page (S-ME-03, D-75)', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('en')
    })

    beforeEach(() => {
        vi.clearAllMocks()
        authApi.sessions.mockResolvedValue({ sessions: [THIS, SAFARI, UNKNOWN] })
        authApi.revokeSession.mockResolvedValue(undefined)
        authApi.revokeOtherSessions.mockResolvedValue(2)
    })

    it('names each device, puts this one first as active, and gives the others their last use and network', async () => {
        renderSection()

        const [first, second, third] = await rows()
        expect(first).toHaveTextContent('Chrome · Windows')
        expect(first).toHaveTextContent('This device')
        expect(first).toHaveTextContent('Active now · IP 14.231.x.x')
        expect(within(first!).queryByRole('button')).toBeNull()
        expect(second).toHaveTextContent('Safari · macOS')
        expect(second).toHaveTextContent('Yesterday 22:15 · IP 113.190.x.x')
        expect(third).toHaveTextContent('Unknown browser')
        expect(third).toHaveTextContent('Yesterday 08:05')
        expect(third).not.toHaveTextContent('IP')
    })

    it('signs out one device at once, without asking, and drops its row', async () => {
        const user = userEvent.setup()
        renderSection()

        await user.click(await screen.findByRole('button', { name: 'Sign out Safari · macOS' }))

        expect(authApi.revokeSession).toHaveBeenCalledWith('safari')
        expect(screen.queryByRole('dialog')).toBeNull()
        await waitFor(async () => expect(await rows()).toHaveLength(2))
        expect(toast.success).toHaveBeenCalledWith('Signed out Safari · macOS')
    })

    it('keeps the row when signing it out fails', async () => {
        const user = userEvent.setup()
        authApi.revokeSession.mockRejectedValue(new Error('offline'))
        renderSection()

        await user.click(await screen.findByRole('button', { name: 'Sign out Safari · macOS' }))

        await waitFor(() => expect(authApi.revokeSession).toHaveBeenCalled())
        expect(await rows()).toHaveLength(3)
        expect(toast.success).not.toHaveBeenCalled()
    })

    it('asks before signing out the other devices, then keeps only this one', async () => {
        const user = userEvent.setup()
        renderSection()

        await user.click(await screen.findByRole('button', { name: 'Sign out the other devices' }))
        const dialog = await screen.findByRole('dialog')
        expect(dialog).toHaveTextContent('Sign out 2 other devices?')
        expect(authApi.revokeOtherSessions).not.toHaveBeenCalled()

        await user.click(within(dialog).getByRole('button', { name: 'Sign out' }))

        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Signed out 2 other devices'))
        expect(await rows()).toHaveLength(1)
        expect(screen.getByText('Only this device is signed in.')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Sign out the other devices' })).toBeNull()
    })

    it('signs nobody out when the question is cancelled', async () => {
        const user = userEvent.setup()
        renderSection()

        await user.click(await screen.findByRole('button', { name: 'Sign out the other devices' }))
        await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(authApi.revokeOtherSessions).not.toHaveBeenCalled()
        expect(await rows()).toHaveLength(3)
    })

    it('says only this device is signed in, with no button to sign out others', async () => {
        authApi.sessions.mockResolvedValue({ sessions: [THIS] })
        renderSection()

        expect(await screen.findByText('Only this device is signed in.')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Sign out the other devices' })).toBeNull()
    })

    it('offers to try again when the list cannot be loaded', async () => {
        const user = userEvent.setup()
        authApi.sessions.mockRejectedValueOnce(new Error('offline'))
        renderSection()

        expect(await screen.findByText('Couldn’t load your sessions')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Try again' }))

        expect(await rows()).toHaveLength(3)
    })
})
