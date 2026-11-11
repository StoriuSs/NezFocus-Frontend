import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Lock } from 'lucide-react'
import { expectNoA11yViolations } from '@/test/a11y'
import { Combobox, type ComboboxProps } from '../combobox'
import type { SelectOption } from '../select'

const lock = <Lock className='size-3' aria-hidden='true' />

const CHANNELS: SelectOption[] = [
    { value: 'none', label: 'Không gửi', description: 'Không tạo tin khi có người vào' },
    { value: 'chao-mung', label: '# chao-mung', trailing: 'Thông tin' },
    { value: 'giai-tich', label: '# giải-tích', trailing: 'Ôn tập' },
    { value: 'bi-mat', label: '# bi-mat', icon: lock, trailing: 'Ôn tập' }
]

function Field({ onPick, ...props }: Partial<ComboboxProps> & { onPick?: (value: string) => void }) {
    const [value, setValue] = useState(props.value ?? 'chao-mung')
    return (
        <>
            <label htmlFor='welcome'>Kênh tin chào mừng</label>
            <Combobox
                id='welcome'
                options={CHANNELS}
                searchLabel='Tìm kênh'
                listLabel='Kênh'
                empty='Không tìm thấy kênh'
                {...props}
                value={value}
                onValueChange={(next) => {
                    setValue(next)
                    onPick?.(next)
                }}
            />
        </>
    )
}

const field = () => screen.getByRole('button', { name: 'Kênh tin chào mừng' })
const search = () => screen.getByRole('combobox', { name: 'Tìm kênh' })
const rows = () => within(screen.getByRole('listbox', { name: 'Kênh' })).getAllByRole('option')

describe('Combobox (C-25)', () => {
    it('reads like a field with the chosen row, and opens on its search box over every row', async () => {
        render(<Field value='bi-mat' />)
        expect(field()).toHaveTextContent('# bi-mat')
        expect(field()).toHaveAttribute('aria-expanded', 'false')

        await userEvent.click(field())
        expect(search()).toHaveFocus()
        expect(rows().map((row) => row.textContent)).toEqual([
            'Không gửiKhông tạo tin khi có người vào',
            '# chao-mungThông tin',
            '# giải-tíchÔn tập',
            '# bi-matÔn tập'
        ])
        expect(rows().map((row) => row.getAttribute('aria-selected'))).toEqual(['false', 'false', 'false', 'true'])
        await expectNoA11yViolations()
    })

    it('filters by the label or the words at the right, without case or accents', async () => {
        render(<Field />)
        await userEvent.click(field())

        await userEvent.type(search(), 'GIAI')
        expect(rows().map((row) => row.textContent)).toEqual(['# giải-tíchÔn tập'])

        await userEvent.clear(search())
        await userEvent.type(search(), '  on   tap ')
        expect(rows()).toHaveLength(2)

        await userEvent.clear(search())
        await userEvent.type(search(), 'khong gui')
        expect(rows().map((row) => row.textContent)).toEqual(['Không gửiKhông tạo tin khi có người vào'])
    })

    it('goes back to the first match as the search changes', async () => {
        render(<Field />)
        await userEvent.click(field())
        await userEvent.keyboard('{ArrowDown}{ArrowDown}')
        await userEvent.type(search(), 'tap')
        expect(search()).toHaveAttribute('aria-activedescendant', rows()[0]!.id)
        await userEvent.keyboard('{Enter}')
        expect(field()).toHaveTextContent('# giải-tích')
    })

    it('says so when nothing matches', async () => {
        render(<Field />)
        await userEvent.click(field())
        await userEvent.type(search(), 'hoa-hoc')
        expect(screen.getByText('Không tìm thấy kênh')).toBeInTheDocument()
        expect(screen.queryAllByRole('option')).toHaveLength(0)
        expect(search()).not.toHaveAttribute('aria-activedescendant')
    })

    it('moves with ↑ ↓ and picks with Enter, then closes on the field', async () => {
        const onPick = vi.fn()
        render(<Field onPick={onPick} />)
        field().focus()
        await userEvent.keyboard('{ArrowDown}')
        expect(search()).toHaveFocus()
        await userEvent.keyboard('{ArrowUp}')
        expect(search()).toHaveAttribute('aria-activedescendant', rows()[0]!.id)
        await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
        expect(search()).toHaveAttribute('aria-activedescendant', rows()[3]!.id)
        await userEvent.keyboard('{ArrowUp}')
        expect(search()).toHaveAttribute('aria-activedescendant', rows()[2]!.id)
        await userEvent.keyboard('{Enter}')

        expect(onPick).toHaveBeenCalledWith('giai-tich')
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
        expect(field()).toHaveTextContent('# giải-tích')
        expect(field()).toHaveFocus()
    })

    it('starts the next search afresh', async () => {
        render(<Field />)
        await userEvent.click(field())
        await userEvent.type(search(), 'on{ArrowDown}{ArrowDown}')
        await userEvent.keyboard('{Escape}')
        await userEvent.click(field())
        expect(search()).toHaveValue('')
        expect(rows()).toHaveLength(4)
        expect(search()).toHaveAttribute('aria-activedescendant', rows()[0]!.id)
    })

    it('keeps the value on Esc', async () => {
        const onPick = vi.fn()
        render(<Field onPick={onPick} />)
        await userEvent.click(field())
        await userEvent.keyboard('{ArrowDown}{Escape}')
        expect(onPick).not.toHaveBeenCalled()
        expect(field()).toHaveTextContent('# chao-mung')
    })

    it('picks with the mouse, the search box keeping the focus until then', async () => {
        const onPick = vi.fn()
        render(<Field onPick={onPick} />)
        await userEvent.click(field())
        // false: the press was kept from moving the focus off the search box.
        expect(fireEvent.mouseDown(rows()[3]!)).toBe(false)
        expect(onPick).toHaveBeenCalledWith('bi-mat')
    })

    it('opens with Enter on the field too', async () => {
        render(<Field />)
        field().focus()
        await userEvent.keyboard('{Enter}')
        expect(search()).toHaveFocus()
    })

    it('keeps the highlight on a row when the rows change under it', async () => {
        const onPick = vi.fn()
        const { rerender } = render(<Field onPick={onPick} />)
        await userEvent.click(field())
        await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
        rerender(<Field onPick={onPick} options={CHANNELS.slice(0, 2)} />)
        expect(search()).toHaveAttribute('aria-activedescendant', rows()[1]!.id)
        await userEvent.keyboard('{Enter}')
        expect(onPick).toHaveBeenCalledWith('chao-mung')
    })

    it('shows a shortcut row above the list while nothing is typed, ticked alone when it is the value', async () => {
        const shortcut = { value: 'giai-tich', label: 'Gần đây: # giải-tích' }
        render(<Field value='giai-tich' shortcut={shortcut} />)
        await userEvent.click(field())

        expect(rows()[0]).toHaveTextContent('Gần đây: # giải-tích')
        expect(rows().filter((row) => row.getAttribute('aria-selected') === 'true')).toEqual([rows()[0]])

        await userEvent.type(search(), 'giai')
        expect(rows().map((row) => row.textContent)).toEqual(['# giải-tíchÔn tập'])
        expect(rows()[0]).toHaveAttribute('aria-selected', 'false')
    })

    it('takes its own match and its own field text', async () => {
        render(
            <Field
                display={{ label: 'Kênh cũ' }}
                value='gone'
                matches={(option, query) => query === 'secret' && option.value === 'bi-mat'}
            />
        )
        expect(field()).toHaveTextContent('Kênh cũ')
        await userEvent.click(field())
        await userEvent.type(search(), 'secret')
        expect(rows().map((row) => row.textContent)).toEqual(['# bi-matÔn tập'])
    })

    it('shows the chosen row over its own field text while the value is a row', () => {
        render(<Field display={{ label: 'Kênh cũ' }} value='giai-tich' />)
        expect(field()).toHaveTextContent('# giải-tích')
    })

    it('cannot be opened while disabled', async () => {
        render(<Field disabled />)
        expect(field()).toBeDisabled()
        await userEvent.click(field())
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
})
