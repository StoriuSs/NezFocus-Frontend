import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IconButton } from '../icon-button'

describe('IconButton (C-02)', () => {
    it('dims its icon to text-tertiary when disabled, as ‹ on the first page (C-41)', () => {
        render(
            <IconButton label='Trang trước' disabled>
                ‹
            </IconButton>
        )
        const button = screen.getByRole('button', { name: 'Trang trước' })
        expect(button).toBeDisabled()
        expect(button).toHaveClass('disabled:text-text-tertiary')
    })
})
