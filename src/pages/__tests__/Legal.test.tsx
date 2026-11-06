import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import { useAuthStore } from '@/features/auth'
import { expectNoA11yViolations } from '@/test/a11y'
import Legal from '@/pages/Legal'

function renderPage(document: 'terms' | 'privacy') {
    render(
        <MemoryRouter>
            <Legal document={document} />
        </MemoryRouter>
    )
}

describe('the legal pages (S-PUB-02)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        useAuthStore.setState({ isAuthenticated: false })
    })

    it('shows the terms in the language on screen, with numbered sections to link to', async () => {
        renderPage('terms')
        expect(screen.getByRole('heading', { level: 1, name: 'Điều khoản sử dụng' })).toBeInTheDocument()
        expect(screen.getByText('Cập nhật lần cuối: 01/11/2026')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: '4. Quy tắc ứng xử' })).toHaveAttribute('id', '4')
        expect(document.title).toBe('Điều khoản sử dụng · NezFocus')

        await i18n.changeLanguage('en')
        expect(await screen.findByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
    })

    it('shows the privacy policy, its lists and its contact link', () => {
        renderPage('privacy')
        expect(screen.getByRole('heading', { level: 1, name: 'Chính sách quyền riêng tư' })).toBeInTheDocument()
        expect(screen.getByText('Thông tin tài khoản:')).toBeInTheDocument()
        const contact = screen.getAllByRole('link', { name: 'hieupt1003@gmail.com' })[0]
        expect(contact).toHaveAttribute('href', 'mailto:hieupt1003@gmail.com')
    })

    it('offers a visitor the way in, and someone signed in only the way back to the app', () => {
        renderPage('terms')
        expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login')
        expect(screen.getByRole('button', { name: 'Chuyển sang English' })).toBeInTheDocument()
    })

    it('shows "Open NezFocus" alone when signed in', () => {
        useAuthStore.setState({ isAuthenticated: true })
        renderPage('terms')
        expect(screen.getByRole('link', { name: 'Mở NezFocus' })).toHaveAttribute('href', '/study')
        expect(screen.queryByRole('button', { name: 'Chuyển sang English' })).toBeNull()
    })

    it('has no critical or serious accessibility problem', async () => {
        renderPage('privacy')
        await expectNoA11yViolations()
    })
})
