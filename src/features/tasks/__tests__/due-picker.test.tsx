import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { expectNoA11yViolations } from '@/test/a11y'
import { DuePicker } from '../components/DuePicker'

const ZONE = 'Asia/Ho_Chi_Minh'
// Sunday 18/10/2026, 21:47 in Hồ Chí Minh (05 › world A).
const NOW = new Date('2026-10-18T14:47:00.000Z')

function renderPicker(value: Date | null = null) {
    const onChange = vi.fn()
    render(
        <TooltipProvider>
            <DuePicker value={value} onChange={onChange} text={null} now={NOW} timeZone={ZONE} />
        </TooltipProvider>
    )
    return onChange
}

describe('DatePicker (C-43)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
    })

    it('opens on today, Monday first, days gone by dimmed and not picked', async () => {
        const onChange = renderPicker()
        await userEvent.click(screen.getByRole('button', { name: /Chưa đặt hạn/ }))
        const grid = await screen.findByRole('grid', { name: 'Tháng 10, 2026' })
        expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
            'T2',
            'T3',
            'T4',
            'T5',
            'T6',
            'T7',
            'CN'
        ])
        const today = screen.getByRole('button', { name: /18 tháng 10/ })
        await waitFor(() => expect(today).toHaveFocus())
        expect(today).toHaveAttribute('aria-current', 'date')
        const gone = screen.getByRole('button', { name: /17 tháng 10/ })
        expect(gone).toHaveAttribute('aria-disabled', 'true')
        expect(gone).toHaveClass('text-text-tertiary')
        await userEvent.click(gone)
        expect(gone.closest('td')).toHaveAttribute('aria-selected', 'false')
        await expectNoA11yViolations(grid.closest('[role="dialog"]') as HTMLElement)
        expect(onChange).not.toHaveBeenCalled()
    })

    it('moves with the arrows and Page Down, picks with Enter, applies with Xong at the time typed', async () => {
        const onChange = renderPicker()
        await userEvent.click(screen.getByRole('button', { name: /Chưa đặt hạn/ }))
        await waitFor(() => expect(screen.getByRole('button', { name: /18 tháng 10/ })).toHaveFocus())
        await userEvent.keyboard('{ArrowRight}{ArrowDown}{Enter}')
        expect(screen.getByRole('button', { name: /26 tháng 10/ }).closest('td')).toHaveAttribute(
            'aria-selected',
            'true'
        )
        await userEvent.keyboard('{PageDown}')
        expect(await screen.findByRole('grid', { name: 'Tháng 11, 2026' })).toBeInTheDocument()
        const time = screen.getByRole('textbox', { name: 'Giờ' })
        await userEvent.clear(time)
        await userEvent.type(time, '0815')
        await userEvent.click(screen.getByRole('button', { name: 'Xong' }))
        expect(onChange).toHaveBeenCalledWith(new Date('2026-10-26T01:15:00.000Z'))
    })

    it('refuses a time it cannot read, keeps the old value on Esc, clears with Bỏ hạn', async () => {
        const onChange = renderPicker(new Date('2026-10-23T16:59:00.000Z'))
        await userEvent.click(screen.getByRole('button', { name: /Chưa đặt hạn/ }))
        const time = await screen.findByRole('textbox', { name: 'Giờ' })
        expect(time).toHaveValue('23:59')
        await userEvent.clear(time)
        await userEvent.type(time, '25:00')
        expect(screen.getByText('Giờ dạng 23:59')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Xong' })).toBeDisabled()
        await userEvent.keyboard('{Escape}')
        expect(onChange).not.toHaveBeenCalled()

        await userEvent.click(screen.getByRole('button', { name: /Chưa đặt hạn/ }))
        await userEvent.click(await screen.findByRole('button', { name: 'Bỏ hạn' }))
        expect(onChange).toHaveBeenCalledWith(null)
    })
})
