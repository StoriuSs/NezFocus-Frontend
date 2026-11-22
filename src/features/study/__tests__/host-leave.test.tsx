import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import { session } from '@/test/study-sessions'
import { asksBeforeLeaving } from '../lib/host-leave'
import { useHostLeave, type HostLeaveKind } from '../host-leave.store'
import type { NextHost } from '../api/study.api'

const studyApi = vi.hoisted(() => ({ fetchNextHost: vi.fn<(sessionId: string) => Promise<NextHost>>() }))
vi.mock('../api/study.api', () => studyApi)

const { default: HostLeaveDialog } = await import('../components/HostLeaveDialog')

let client: QueryClient
const Providers = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
)
const confirm = vi.fn()
const asking = (kind: HostLeaveKind) => {
    act(() => useHostLeave.getState().ask({ sessionId: 's1', kind, confirm }))
    return render(<HostLeaveDialog joinedSessionId='s1' />, { wrapper: Providers })
}

beforeAll(() => i18n.changeLanguage('vi'))
beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    confirm.mockClear()
    useHostLeave.setState({ asking: null })
    studyApi.fetchNextHost.mockReset()
    studyApi.fetchNextHost.mockResolvedValue({ id: 'binh', displayName: 'Bình' })
})

describe('"Rời phòng?" of the Host (07 S-ROOM-04 host-leave-confirm, D-44, D-50, D-77, D-233)', () => {
    it('names who will control the session, read as it opens; the focus on Ở lại; leaves once confirmed', async () => {
        asking('leave')
        expect(screen.getByRole('heading', { name: 'Rời phòng?' })).toBeVisible()
        expect(await screen.findByText('Bình sẽ điều khiển phiên học.')).toBeVisible()
        expect(studyApi.fetchNextHost).toHaveBeenCalledWith('s1')
        expect(screen.getByRole('button', { name: 'Ở lại' })).toHaveFocus()
        await expectNoA11yViolations()
        await userEvent.click(screen.getByRole('button', { name: 'Rời phòng' }))
        expect(confirm).toHaveBeenCalledTimes(1)
        expect(useHostLeave.getState().asking).toBeNull()
    })

    it('closes, nothing done, once the session asked about is not the one of the room this tab is in', () => {
        const view = asking('leave')
        expect(screen.getByRole('dialog')).toBeVisible()
        // Put out of the room, or the session ended, while asked.
        view.rerender(<HostLeaveDialog joinedSessionId={null} />)
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(useHostLeave.getState().asking).toBeNull()
        expect(confirm).not.toHaveBeenCalled()
    })

    it('stays, doing nothing, on Ở lại', async () => {
        asking('leave')
        await userEvent.click(screen.getByRole('button', { name: 'Ở lại' }))
        expect(confirm).not.toHaveBeenCalled()
        expect(useHostLeave.getState().asking).toBeNull()
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('says the session runs on with no one in control when nobody present may start', async () => {
        studyApi.fetchNextHost.mockResolvedValue(null)
        asking('leave')
        expect(await screen.findByText('Phiên học vẫn chạy nhưng chưa có người điều khiển.')).toBeVisible()
    })

    it('names nobody while reading, when it cannot be read, or for an account shown as deleted', async () => {
        studyApi.fetchNextHost.mockReturnValue(new Promise(() => undefined))
        const reading = asking('leave')
        expect(screen.getByText('Người ở trong phòng lâu nhất mà đủ quyền sẽ điều khiển phiên học.')).toBeVisible()
        reading.unmount()

        // A new client each time: the read that never ends stays in the one before.
        client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        studyApi.fetchNextHost.mockRejectedValue(apiError(503, 'SERVICE_UNAVAILABLE_ERROR'))
        const failed = asking('leave')
        await vi.waitFor(() => expect(studyApi.fetchNextHost).toHaveBeenCalledTimes(2))
        await vi.waitFor(() => expect(client.getQueryState(['study', 'next-host', 's1'])?.status).toBe('error'))
        expect(screen.getByText('Người ở trong phòng lâu nhất mà đủ quyền sẽ điều khiển phiên học.')).toBeVisible()
        failed.unmount()

        client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        studyApi.fetchNextHost.mockResolvedValue({ id: 'binh', displayName: null })
        asking('leave')
        await vi.waitFor(() => expect(client.getQueryState(['study', 'next-host', 's1'])?.status).toBe('success'))
        expect(screen.getByText('Người ở trong phòng lâu nhất mà đủ quyền sẽ điều khiển phiên học.')).toBeVisible()
    })

    it('says Chuyển phòng from the preview page, Đăng xuất from the menu (D-50, D-77)', async () => {
        const switching = asking('switch')
        expect(screen.getByRole('button', { name: 'Chuyển phòng' })).toBeVisible()
        switching.unmount()
        asking('signOut')
        expect(screen.getByRole('heading', { name: 'Đăng xuất và rời phòng?' })).toBeVisible()
        await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }))
        expect(confirm).toHaveBeenCalledTimes(1)
    })
})

describe('who is asked before leaving (asksBeforeLeaving, D-44)', () => {
    it('the Host of a session not yet ended, paused too; nobody else, and not once it ended', () => {
        expect(asksBeforeLeaving(session(), 'an')).toBe(true)
        expect(asksBeforeLeaving(session({ status: 'paused' }), 'an')).toBe(true)
        expect(asksBeforeLeaving(session(), 'binh')).toBe(false)
        expect(asksBeforeLeaving(session({ status: 'ended' }), 'an')).toBe(false)
        expect(asksBeforeLeaving(session({ hostId: null }), 'an')).toBe(false)
        expect(asksBeforeLeaving(null, 'an')).toBe(false)
        expect(asksBeforeLeaving(session(), undefined)).toBe(false)
    })
})
