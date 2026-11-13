import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog'
import { Select } from '../select'

/**
 * Layers stacked on one another (a Select in a Dialog) take Esc and the
 * page's pointer one at a time: every Radix layer must share one stack, or
 * Esc closes both and the page stays unclickable after the dialog closes.
 */
function CategoryInDialog() {
    const [category, setCategory] = useState('none')
    return (
        <Dialog defaultOpen>
            <DialogContent>
                <DialogTitle>Tạo kênh</DialogTitle>
                <DialogDescription>Kênh mới</DialogDescription>
                <Select
                    aria-label='Danh mục'
                    value={category}
                    onValueChange={setCategory}
                    options={[
                        { value: 'none', label: 'Không có danh mục' },
                        { value: 'info', label: 'THÔNG TIN' }
                    ]}
                />
            </DialogContent>
        </Dialog>
    )
}

describe('A Select in a Dialog', () => {
    it('closes alone on Esc, and the page takes clicks again once the dialog closes', async () => {
        const user = userEvent.setup()
        render(<CategoryInDialog />)
        await user.click(screen.getByRole('combobox', { name: 'Danh mục' }))
        expect(await screen.findByRole('listbox')).toBeInTheDocument()

        await user.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
        expect(screen.getByRole('dialog', { name: 'Tạo kênh' })).toBeInTheDocument()

        await user.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(document.body.style.pointerEvents).not.toBe('none')
    })
})
