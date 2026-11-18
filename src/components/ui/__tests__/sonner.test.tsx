import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import i18n from '@/i18n'
import { useToastArea } from '@/hooks/useToastArea'
import { Toaster } from '../sonner'

describe('Toast (C-16)', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('vi')
    })

    it('can be closed before it hides by itself', async () => {
        render(<Toaster />)
        act(() => {
            toast.success('Đã đổi mật khẩu')
        })

        const close = await screen.findByRole('button', { name: 'Đóng thông báo' })
        // At the top right (Sonner's default is the top left), through its position variables.
        const style = (close.closest('[data-sonner-toast]') as HTMLElement).style
        expect(style.getPropertyValue('--toast-close-button-start')).toBe('auto')
        expect(style.getPropertyValue('--toast-close-button-end')).toBe('0')

        // A click, not userEvent: jsdom has no setPointerCapture, which Sonner calls on pointerdown.
        fireEvent.click(close)

        await waitFor(() => expect(screen.queryByText('Đã đổi mật khẩu')).not.toBeInTheDocument())
    })

    it('lets a fourth one push the oldest out, which then counts as gone (C-16 › Hàng đợi)', async () => {
        const gone = vi.fn()
        render(<Toaster />)
        act(() => {
            toast('Đã xong “Một”', { id: 'one', duration: 60_000, onDismiss: gone })
            toast('Đã xong “Hai”', { id: 'two', duration: 60_000 })
            toast('Đã xong “Ba”', { id: 'three', duration: 60_000 })
        })
        await screen.findByText('Đã xong “Ba”')
        expect(gone).not.toHaveBeenCalled()

        act(() => {
            toast('Đã xong “Bốn”', { id: 'four', duration: 60_000 })
        })

        // Not kept hidden behind the three (Sonner's own way): it goes, and whoever waits on it hears so.
        await waitFor(() => expect(gone).toHaveBeenCalledTimes(1))
        await waitFor(() => expect(screen.queryByText('Đã xong “Một”')).not.toBeInTheDocument())
        expect(screen.getByText('Đã xong “Bốn”')).toBeInTheDocument()
        act(() => {
            toast.dismiss()
        })
    })

    describe('where it sits', () => {
        afterEach(() => {
            useToastArea.setState({ contentRight: null, barTop: null, liftTop: null })
            vi.restoreAllMocks()
        })

        it('follows the content area and the composer of the page (C-16)', async () => {
            vi.spyOn(window, 'matchMedia').mockImplementation(
                (query) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} }) as never
            )
            useToastArea.setState({ contentRight: window.innerWidth - 300, barTop: window.innerHeight - 100 })
            render(<Toaster />)
            act(() => {
                toast('Đã sao chép')
            })

            await screen.findByText('Đã sao chép')
            const toaster = document.querySelector<HTMLElement>('[data-sonner-toaster]')!
            expect(toaster.dataset.xPosition).toBe('right')
            expect(toaster.style.getPropertyValue('--offset-right')).toBe('316px')
            expect(toaster.style.getPropertyValue('--offset-bottom')).toBe('116px')
        })
    })
})
