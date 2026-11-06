import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { expectNoA11yViolations } from '@/test/a11y'
import { queryWrapper } from '@/test/helpers'
import AuthShell from '@/app/layout/AuthShell'
import { useAuthStore } from '@/features/auth'

function renderShell(at = '/login') {
    const router = createMemoryRouter(
        [
            { path: '/', element: <p>Home</p> },
            {
                element: <AuthShell />,
                children: [
                    { path: '/login', element: <h1>Sign in</h1> },
                    { path: '/welcome', element: <h1>Complete your account</h1> }
                ]
            }
        ],
        { initialEntries: [at] }
    )
    render(
        <TooltipProvider>
            <RouterProvider router={router} />
        </TooltipProvider>,
        { wrapper: queryWrapper() }
    )
    return router
}

describe('AuthShell (C-34)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
    })

    it('frames the page: the logo goes home, the brand panel is real text', async () => {
        const router = renderShell()
        expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Không học một mình' })).toBeInTheDocument()
        expect(screen.getByText('Giờ học được tính thật')).toBeInTheDocument()
        expect(screen.getByRole('img', { name: /sáu người cùng học/ })).toBeInTheDocument()

        await userEvent.click(screen.getByRole('link', { name: 'Trang chủ NezFocus' }))
        expect(router.state.location.pathname).toBe('/')
    })

    it('switches language at its foot; the language in use is not a button (D-64)', async () => {
        renderShell()
        const toggle = screen.getByRole('group', { name: 'Ngôn ngữ' })
        expect(toggle).toHaveTextContent('Tiếng Việt')
        expect(screen.queryByRole('button', { name: 'Tiếng Việt' })).not.toBeInTheDocument()
        expect(screen.getByText('Tiếng Việt')).toHaveAttribute('aria-current', 'true')

        await userEvent.click(screen.getByRole('button', { name: 'English' }))

        expect(i18n.resolvedLanguage).toBe('en')
        expect(await screen.findByRole('heading', { name: 'Never study alone' })).toBeInTheDocument()
        expect(screen.getByText('English')).toHaveAttribute('aria-current', 'true')
        expect(screen.getByRole('button', { name: 'Tiếng Việt' })).toBeInTheDocument()
    })

    it('offers signing out only on "complete your account", where the account may be the wrong one', () => {
        renderShell()
        expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull()
    })

    it('signs out from "complete your account"', async () => {
        const logout = vi.fn()
        useAuthStore.setState({ logout })
        renderShell('/welcome')

        await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }))
        expect(logout).toHaveBeenCalledOnce()
    })

    it('has no critical or serious accessibility problem', async () => {
        renderShell()
        await expectNoA11yViolations()
    })
})
