import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { expectNoA11yViolations } from '@/test/a11y'
import { mockAuthStore, queryWrapper } from '@/test/helpers'

const authState = {
    isAuthenticated: true,
    user: { id: 'user-1', email: 'an@example.test', username: 'an.nguyen', displayName: 'An', roles: ['user'] },
    logout: vi.fn()
}
const profile = { ...authState.user, avatarUrl: null, bio: 'Ôn Giải tích 2 mỗi tối 21:00' }

vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))
vi.mock('@/features/users/api/useProfile', () => ({ useProfile: () => ({ data: profile }) }))

const { default: AppShell } = await import('@/app/layout/app-shell/AppShell')
const { default: MockChannelPage } = await import('@/app/layout/app-shell/MockChannelPage')
const { default: Study } = await import('@/pages/Study')

function renderAt(path: string) {
    const router = createMemoryRouter(
        [
            {
                element: <AppShell />,
                children: [
                    { path: '/study', element: <Study />, handle: { column: 'study' } },
                    {
                        path: '/channels/:serverId/:channelId?',
                        element: <MockChannelPage />,
                        handle: { column: 'server' }
                    },
                    { path: '/settings/account', element: <h1>Settings page</h1>, handle: { column: 'settings' } },
                    { path: '/profile', element: <h1>Profile page</h1>, handle: { column: 'settings' } }
                ]
            }
        ],
        { initialEntries: [path] }
    )
    render(
        <TooltipProvider>
            <RouterProvider router={router} />
        </TooltipProvider>,
        { wrapper: queryWrapper() }
    )
    return router
}

const rail = () => screen.getByRole('navigation', { name: 'Servers' })

describe('AppShell (S-SHELL-01)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        authState.logout.mockReset()
        localStorage.clear()
    })

    describe('on the Study page', () => {
        it('marks Study as where you are, in the rail and in its column', async () => {
            renderAt('/study')
            expect(await screen.findByRole('heading', { level: 1, name: 'Study' })).toBeInTheDocument()
            const pages = screen.getByRole('navigation', { name: 'Pages' })
            expect(within(pages).getByRole('link', { name: 'Study' })).toHaveAttribute('aria-current', 'page')
            const column = screen.getByRole('navigation', { name: 'Study' })
            expect(within(column).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
            // No server is selected.
            expect(within(rail()).queryByRole('link', { current: 'page' })).not.toBeInTheDocument()
        })

        it('says which rail items arrive later, and they lead nowhere', async () => {
            const router = renderAt('/study')
            const dm = await screen.findByRole('button', { name: 'Direct messages · coming soon' })
            expect(dm).toHaveAttribute('aria-disabled', 'true')
            await userEvent.click(dm)
            expect(router.state.location.pathname).toBe('/study')
            expect(screen.getByRole('button', { name: 'To-do · coming soon' })).toBeInTheDocument()
        })

        it('reads each server with what is unread in it', async () => {
            renderAt('/study')
            await screen.findByRole('heading', { level: 1, name: 'Study' })
            expect(
                within(rail()).getByRole('link', { name: 'Nhóm đồ án Mobile, unread mentions of you: 2' })
            ).toBeInTheDocument()
            expect(
                within(rail()).getByRole('link', { name: 'CLB Guitar PTIT, has unread messages' })
            ).toBeInTheDocument()
        })

        it('has no critical or serious accessibility problem', async () => {
            renderAt('/study')
            await screen.findByRole('heading', { level: 1, name: 'Study' })
            await expectNoA11yViolations()
        })
    })

    describe('in a channel of a (mock) server', () => {
        it('opens a server at its first channel, and marks both', async () => {
            const router = renderAt('/channels/on-thi-giai-tich-2')
            await waitFor(() => expect(router.state.location.pathname).toBe('/channels/on-thi-giai-tich-2/chao-mung'))
            expect(within(rail()).getByRole('link', { name: 'Ôn thi Giải tích 2' })).toHaveAttribute(
                'aria-current',
                'page'
            )
            const channels = screen.getByRole('navigation', { name: 'Channels of Ôn thi Giải tích 2' })
            expect(within(channels).getByRole('link', { name: 'chao-mung' })).toHaveAttribute('aria-current', 'page')
            expect(screen.getByRole('heading', { level: 1, name: 'chao-mung' })).toBeInTheDocument()
        })

        it('folds a category', async () => {
            renderAt('/channels/on-thi-giai-tich-2/hoi-dap')
            const category = await screen.findByRole('button', { name: 'PHÒNG HỌC' })
            expect(screen.getByRole('link', { name: 'Phòng học im lặng' })).toBeVisible()
            await userEvent.click(category)
            expect(category).toHaveAttribute('aria-expanded', 'false')
            expect(screen.queryByRole('link', { name: 'Phòng học im lặng' })).not.toBeInTheDocument()

            await userEvent.click(category)
            expect(screen.getByRole('link', { name: 'Phòng học im lặng' })).toBeInTheDocument()
        })

        it('keeps the open channel and the ones that mention you in a folded category (C-06)', async () => {
            renderAt('/channels/on-thi-giai-tich-2/hoi-dap')
            await userEvent.click(await screen.findByRole('button', { name: 'THÔNG TIN' }))
            const channels = screen.getByRole('navigation', { name: 'Channels of Ôn thi Giải tích 2' })
            expect(within(channels).getByRole('link', { name: 'hoi-dap' })).toHaveAttribute('aria-current', 'page')
            expect(
                within(channels).getByRole('link', { name: 'viec-nhom, unread mentions of you: 2' })
            ).toBeInTheDocument()
            expect(within(channels).queryByRole('link', { name: 'tai-lieu' })).not.toBeInTheDocument()
            expect(
                within(channels).queryByRole('link', { name: 'thong-bao, has unread messages' })
            ).not.toBeInTheDocument()
        })

        it('opens the members panel as a sheet below 1280; Esc closes it and focus goes back', async () => {
            renderAt('/channels/on-thi-giai-tich-2/hoi-dap')
            const button = await screen.findByRole('button', { name: 'Members' })
            // A narrow window (jsdom matches no media query): closed at first.
            expect(button).toHaveAttribute('aria-pressed', 'false')
            expect(screen.queryByRole('complementary', { name: 'Members' })).not.toBeInTheDocument()

            await userEvent.click(button)
            const panel = screen.getByRole('complementary', { name: 'Members' })
            expect(button).toHaveAttribute('aria-pressed', 'true')
            expect(within(panel).getByRole('heading', { name: 'Online — 5' })).toBeInTheDocument()
            expect(within(panel).getByRole('heading', { name: 'Offline — 3' })).toBeInTheDocument()
            await expectNoA11yViolations()

            await userEvent.keyboard('{Escape}')
            expect(screen.queryByRole('complementary', { name: 'Members' })).not.toBeInTheDocument()
            expect(button).toHaveFocus()
        })
    })

    describe('the navigation sheet below 1024', () => {
        it('opens from ☰ into the list, closes on Esc with focus back on ☰', async () => {
            renderAt('/study')
            const menu = await screen.findByRole('button', { name: 'Open navigation' })
            expect(menu).toHaveAttribute('aria-expanded', 'false')

            await userEvent.click(menu)
            expect(menu).toHaveAttribute('aria-expanded', 'true')
            expect(screen.getByRole('link', { name: 'Overview' })).toHaveFocus()

            await userEvent.keyboard('{Escape}')
            expect(menu).toHaveAttribute('aria-expanded', 'false')
            expect(menu).toHaveFocus()
        })

        it('closes when a page is opened from it', async () => {
            renderAt('/study')
            const menu = await screen.findByRole('button', { name: 'Open navigation' })
            await userEvent.click(menu)
            await userEvent.click(within(rail()).getByRole('link', { name: 'Ôn thi Giải tích 2' }))
            await screen.findByRole('heading', { level: 1, name: 'chao-mung' })
            expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false')
        })
    })

    describe('your menu (S-ME-01)', () => {
        const openMenu = async () => {
            await userEvent.click(await screen.findByRole('button', { name: 'An, Online — open your menu' }))
            return screen.findByRole('menu')
        }

        it('shows who you are, and goes to your profile and to Settings', async () => {
            const router = renderAt('/study')
            const menu = await openMenu()
            const me = within(menu).getByRole('menuitem', { name: 'An — view and edit your profile' })
            expect(me).toHaveTextContent('an.nguyen')
            expect(me).toHaveTextContent('Ôn Giải tích 2 mỗi tối 21:00')
            await expectNoA11yViolations()

            await userEvent.click(me)
            expect(router.state.location.pathname).toBe('/profile')
            expect(screen.getByRole('navigation', { name: 'Settings' })).toBeInTheDocument()

            await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Settings' }))
            expect(router.state.location.pathname).toBe('/settings/account')
        })

        it('signs out', async () => {
            renderAt('/study')
            await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Sign out' }))
            expect(authState.logout).toHaveBeenCalledTimes(1)
        })

        it('changes your status, shown on your avatar', async () => {
            renderAt('/study')
            const menu = await openMenu()
            await userEvent.click(within(menu).getByRole('menuitem', { name: 'Online' }))
            const statuses = await screen.findAllByRole('menuitemradio')
            expect(statuses.map((item) => item.textContent)).toEqual([
                'Online',
                'AwayTurns on by itself after 10 minutes of not using NezFocus',
                'Do not disturbOnly lets others know — notifications stay the same',
                'InvisibleEveryone sees you as offline'
            ])
            await userEvent.click(statuses[3]!)
            expect(await screen.findByRole('button', { name: 'An, Invisible — open your menu' })).toBeInTheDocument()
        })
    })
})
