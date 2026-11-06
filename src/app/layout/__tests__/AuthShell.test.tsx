import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { expectNoA11yViolations } from '@/test/a11y'
import { queryWrapper } from '@/test/helpers'
import AuthShell from '@/app/layout/AuthShell'

function renderShell() {
    const router = createMemoryRouter(
        [
            { path: '/', element: <p>Home</p> },
            { element: <AuthShell />, children: [{ path: '/sign-in', element: <h1>Sign in</h1> }] }
        ],
        { initialEntries: ['/sign-in'] }
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

    it('has no critical or serious accessibility problem', async () => {
        renderShell()
        await expectNoA11yViolations()
    })
})
