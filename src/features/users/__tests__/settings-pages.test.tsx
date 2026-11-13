import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import i18n from '@/i18n'
import { useThemeStore } from '@/hooks/useTheme'
import { apiError } from '@/test/helpers'
import { notifyMutationError } from '@/lib/query-client'
import { expectNoA11yViolations } from '@/test/a11y'
import type { UserSettings } from '@/features/users/types'

const api = { get: vi.fn(), patch: vi.fn() }
vi.mock('@/lib/api', () => ({ default: api }))
const sound = vi.hoisted(() => ({ playPhaseSound: vi.fn() }))
vi.mock('@/lib/phase-sound', () => sound)
// The shell opens its socket after the first paint: no network here.
vi.mock('@/lib/socket', () => ({ openSocket: () => () => undefined }))

const { default: Appearance } = await import('@/features/users/pages/Appearance')
const { default: Notifications } = await import('@/features/users/pages/Notifications')
const { default: Privacy } = await import('@/features/users/pages/Privacy')
const { useAccountSettings } = await import('@/features/users/hooks/useAccountSettings')

const saved: UserSettings = {
    timezone: 'Asia/Ho_Chi_Minh',
    timezoneChangeableAt: null,
    language: 'en',
    theme: 'system',
    phaseSound: true,
    browserNotifications: false,
    notifyMentions: true,
    notifyDirectMessages: true,
    notifyIncomingCalls: true,
    notifyPhaseChanges: true,
    notificationPromptDismissed: false,
    allowServerMemberMessages: true,
    showStudyActivity: true
}

/** The AppShell's part: it keeps the tab on the account's theme and language. */
function Shell({ children }: { children: ReactNode }) {
    useAccountSettings()
    return <>{children}</>
}

/** The API as it answers: GET the settings, PATCH merges what was sent. */
function serve(settings: Partial<UserSettings> = {}) {
    let current = { ...saved, ...settings }
    api.get.mockImplementation(() => Promise.resolve({ data: { data: current } }))
    api.patch.mockImplementation((_url: string, changes: Partial<UserSettings>) => {
        current = { ...current, ...changes }
        return Promise.resolve({ data: { data: current } })
    })
}

function renderPage(page: ReactNode, settings: Partial<UserSettings> = {}) {
    serve(settings)
    mount(page)
}

function mount(page: ReactNode) {
    // The app's own toast for a failed mutation (src/lib/query-client.ts), so a second toast would show.
    const client = new QueryClient({
        mutationCache: new MutationCache({
            onError: (error, _v, _c, mutation) => notifyMutationError(error, mutation.meta)
        }),
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    })
    render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <Shell>{page}</Shell>
            </MemoryRouter>
            <Toaster />
        </QueryClientProvider>
    )
}

/** The toasts on screen: one per failed save, none when the page says it itself. */
const toasts = () => document.querySelectorAll('[data-sonner-toast]')

const isDark = () => document.documentElement.classList.contains('dark')

beforeEach(async () => {
    await i18n.changeLanguage('en')
    api.get.mockReset()
    api.patch.mockReset()
    sound.playPhaseSound.mockReset()
    useThemeStore.getState().setTheme('light')
})

afterEach(async () => {
    vi.useRealTimers()
    await i18n.changeLanguage('en')
})

describe('Appearance & language (S-ME-04)', () => {
    it("applies the account's theme and language as the app opens, as chosen in another browser", async () => {
        renderPage(<Appearance />, { theme: 'dark', language: 'vi' })

        expect(await screen.findByRole('radio', { name: 'Tối' })).toHaveAttribute('aria-checked', 'true')
        expect(isDark()).toBe(true)
        expect(localStorage.getItem('theme')).toBe('dark')
        expect(i18n.resolvedLanguage).toBe('vi')
    })

    it('shows a theme at once, saves it to the account, and moves with the arrow keys', async () => {
        const user = userEvent.setup()
        renderPage(<Appearance />)
        expect(await screen.findByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true')

        await user.click(screen.getByRole('radio', { name: 'Dark' }))
        expect(isDark()).toBe(true)
        expect(api.patch).toHaveBeenCalledWith('/users/me/settings', { theme: 'dark' })

        await user.keyboard('{ArrowRight}')
        expect(screen.getByRole('radio', { name: 'Light' })).toHaveFocus()
        expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')
        expect(isDark()).toBe(false)
        await waitFor(() => expect(api.patch).toHaveBeenLastCalledWith('/users/me/settings', { theme: 'light' }))
    })

    it('switches the whole app to the language chosen, each language named in its own', async () => {
        const user = userEvent.setup()
        renderPage(<Appearance />)

        await user.click(await screen.findByRole('radio', { name: 'Tiếng Việt' }))

        expect(i18n.resolvedLanguage).toBe('vi')
        expect(await screen.findByRole('heading', { name: 'Ngôn ngữ' })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute('lang', 'en')
        expect(api.patch).toHaveBeenCalledWith('/users/me/settings', { language: 'vi' })
    })

    it('puts the old theme back when the save fails; Try again sends it again', async () => {
        const user = userEvent.setup()
        renderPage(<Appearance />)
        api.patch.mockRejectedValueOnce(apiError(503, 'SERVICE_UNAVAILABLE_ERROR'))

        await user.click(await screen.findByRole('radio', { name: 'Dark' }))

        expect(await screen.findByText("Couldn't save your change")).toBeInTheDocument()
        expect(toasts()).toHaveLength(1)
        await waitFor(() =>
            expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true')
        )
        expect(isDark()).toBe(false)

        await user.click(screen.getByRole('button', { name: 'Try again' }))
        await waitFor(() => expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true'))
        expect(api.patch).toHaveBeenCalledTimes(2)
        expect(isDark()).toBe(true)
    })

    it('follows a choice saved in another tab of this browser', async () => {
        renderPage(<Appearance />)
        await screen.findByRole('radio', { name: 'System' })

        const otherTab = new BroadcastChannel('settings')
        otherTab.postMessage({ ...saved, theme: 'dark' })
        otherTab.close()

        await waitFor(() => expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true'))
        expect(isDark()).toBe(true)
    })

    it('has no accessibility problems', async () => {
        renderPage(<Appearance />)
        await screen.findByRole('radio', { name: 'System' })
        await expectNoA11yViolations()
    })

    describe('the time zone', () => {
        const NOW = new Date('2026-11-07T14:47:00Z')
        beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW }))

        async function pickTokyo(user: ReturnType<typeof userEvent.setup>) {
            await user.click(await screen.findByRole('button', { name: 'Time zone' }))
            await user.type(screen.getByRole('combobox', { name: 'Search a city or GMT' }), 'tokyo')
            await user.keyboard('{Enter}')
            return screen.findByRole('dialog', { name: /Change your time zone to GMT\+9\s·\sTokyo\?/ })
        }

        it('shows the time there and what it is for', async () => {
            renderPage(<Appearance />)

            expect(await screen.findByText('Time there now: 21:47')).toBeInTheDocument()
            expect(
                screen.getByText('Used to count study days and streaks. You can change it once every 24 hours.')
            ).toBeInTheDocument()
        })

        it('asks first; Cancel keeps the zone and saves nothing', async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
            renderPage(<Appearance />)

            const ask = await pickTokyo(user)
            await user.click(within(ask).getByRole('button', { name: 'Cancel' }))

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Time zone' })).toHaveTextContent('GMT+7 · Ho Chi Minh')
            expect(api.patch).not.toHaveBeenCalled()
        })

        it('changes it from the question, then locks it until 24 hours later, said in the new zone', async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
            renderPage(<Appearance />)
            api.patch.mockResolvedValueOnce({
                data: { data: { ...saved, timezone: 'Asia/Tokyo', timezoneChangeableAt: '2026-11-08T14:47:00.000Z' } }
            })

            await user.click(within(await pickTokyo(user)).getByRole('button', { name: 'Change time zone' }))

            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
            expect(api.patch).toHaveBeenCalledWith('/users/me/settings', { timezone: 'Asia/Tokyo' })
            const picker = screen.getByRole('button', { name: 'Time zone' })
            expect(picker).toHaveTextContent('GMT+9 · Tokyo')
            expect(picker).toBeDisabled()
            expect(screen.getByText('You can change it again after 23:47 on 08/11 (GMT+9)')).toBeInTheDocument()
            expect(screen.getByText('Time there now: 23:47')).toBeInTheDocument()
        })

        it('unlocks by itself once the 24 hours are up', async () => {
            renderPage(<Appearance />, { timezoneChangeableAt: new Date(NOW.getTime() + 30_000).toISOString() })
            expect(await screen.findByRole('button', { name: 'Time zone' })).toBeDisabled()

            await act(() => vi.advanceTimersByTimeAsync(60_000))

            expect(screen.getByRole('button', { name: 'Time zone' })).toBeEnabled()
        })

        it('offers Try again when the change fails, which sends the same zone', async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
            renderPage(<Appearance />)
            api.patch.mockRejectedValueOnce(new AxiosError('offline', 'ERR_NETWORK')).mockResolvedValueOnce({
                data: { data: { ...saved, timezone: 'Asia/Tokyo', timezoneChangeableAt: '2026-11-08T14:47:00.000Z' } }
            })

            await user.click(within(await pickTokyo(user)).getByRole('button', { name: 'Change time zone' }))
            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
            expect(screen.getByRole('button', { name: 'Time zone' })).toHaveTextContent('GMT+7 · Ho Chi Minh')
            await user.click(await screen.findByRole('button', { name: 'Try again' }))

            await waitFor(() =>
                expect(screen.getByRole('button', { name: 'Time zone' })).toHaveTextContent('GMT+9 · Tokyo')
            )
            expect(api.patch).toHaveBeenCalledTimes(2)
            expect(api.patch).toHaveBeenLastCalledWith('/users/me/settings', { timezone: 'Asia/Tokyo' })
        })

        it('shows the lock when another tab changed the zone meanwhile', async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
            renderPage(<Appearance />)
            const ask = await pickTokyo(user)
            serve({ timezone: 'Europe/Paris', timezoneChangeableAt: '2026-11-08T14:40:00.000Z' })
            api.patch.mockRejectedValueOnce(
                apiError(429, 'RATE_LIMIT_EXCEEDED', {
                    data: { reason: 'timezone', changeableAt: '2026-11-08T14:40:00.000Z' }
                })
            )

            await user.click(within(ask).getByRole('button', { name: 'Change time zone' }))

            await waitFor(() => expect(screen.getByRole('button', { name: 'Time zone' })).toBeDisabled())
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
            expect(screen.getByText('You can change it again after 15:40 on 08/11 (GMT+1)')).toBeInTheDocument()
            expect(toasts()).toHaveLength(0)
        })
    })
})

describe('Notifications (S-ME-06)', () => {
    it('saves the phase sound switch; Play sample plays even with it off', async () => {
        const user = userEvent.setup()
        renderPage(<Notifications />, { phaseSound: false })
        const phaseSound = await screen.findByRole('switch', { name: 'Phase change sound' })
        expect(phaseSound).toHaveAttribute('aria-checked', 'false')
        expect(phaseSound).toHaveAccessibleDescription('Plays a short sound when switching between Focus and Break.')

        await user.click(screen.getByRole('button', { name: 'Play sample' }))
        expect(sound.playPhaseSound).toHaveBeenCalledTimes(1)

        await user.click(screen.getByText('Phase change sound'))
        expect(phaseSound).toHaveAttribute('aria-checked', 'true')
        expect(api.patch).toHaveBeenCalledWith('/users/me/settings', { phaseSound: true })
    })

    it('has no accessibility problems', async () => {
        renderPage(<Notifications />)
        await screen.findByRole('switch', { name: 'Phase change sound' })
        await expectNoA11yViolations()
    })
})

describe('Privacy (S-ME-05)', () => {
    it('saves each switch, and its description says what the new position means', async () => {
        const user = userEvent.setup()
        renderPage(<Privacy />)
        const activity = await screen.findByRole('switch', { name: 'Show study activity' })
        const messages = screen.getByRole('switch', { name: 'Allow direct messages from server members' })

        await user.click(activity)
        await user.click(messages)

        expect(activity).toHaveAccessibleDescription(
            "No one sees that you're studying or which room you're in. People in a room still see you in its list."
        )
        expect(messages).toHaveAccessibleDescription('Only your friends can message you.')
        expect(api.patch).toHaveBeenCalledWith('/users/me/settings', { showStudyActivity: false })
        expect(api.patch).toHaveBeenCalledWith('/users/me/settings', { allowServerMemberMessages: false })
    })

    it('says when the settings could not be loaded, and loads them again on Try again', async () => {
        const user = userEvent.setup()
        serve()
        api.get.mockRejectedValueOnce(apiError(503, 'SERVICE_UNAVAILABLE_ERROR'))
        mount(<Privacy />)

        expect(await screen.findByText("Couldn't load your settings.")).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Try again' }))

        expect(await screen.findByRole('switch', { name: 'Show study activity' })).toBeInTheDocument()
    })

    it('has no accessibility problems', async () => {
        renderPage(<Privacy />)
        await screen.findByRole('switch', { name: 'Show study activity' })
        await expectNoA11yViolations()
    })
})
