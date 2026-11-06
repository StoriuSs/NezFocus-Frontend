import { beforeAll, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import i18n from '@/i18n'
import { expectNoA11yViolations } from '@/test/a11y'
import { PasswordRules } from '../components/PasswordRules'

const item = (name: RegExp) => screen.getByText(name).closest('li') as HTMLElement

describe('PasswordRules (C-22)', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('vi')
    })

    it('lists the five conditions in the grid, and nothing else', () => {
        render(<PasswordRules password='' />)

        const items = within(screen.getByRole('list')).getAllByRole('listitem')
        expect(items.map((li) => li.dataset.rule)).toEqual(['min_length', 'uppercase', 'lowercase', 'digit', 'special'])
        expect(screen.queryByText(/128/)).not.toBeInTheDocument()
    })

    it('ticks off each condition the password meets, as in the frame password-rules (Ontap2)', () => {
        render(<PasswordRules password='Ontap2' />)

        for (const rule of [/chữ hoa/, /chữ thường/, /chữ số/]) expect(item(rule).dataset.state).toBe('met')
        for (const rule of [/8 ký tự/, /ký tự đặc biệt/]) expect(item(rule).dataset.state).toBe('unmet')
    })

    it('marks the unmet conditions as errors once the form was sent', () => {
        render(<PasswordRules password='Ontap2' showErrors />)

        expect(item(/8 ký tự/).dataset.state).toBe('error')
        expect(item(/chữ hoa/).dataset.state).toBe('met')
    })

    it('marks a condition the API refused, even if the browser thought it met', () => {
        render(<PasswordRules password='Ontap2026!' serverRules={['digit']} />)

        expect(item(/chữ số/).dataset.state).toBe('error')
    })

    it('says which condition was just met, politely', () => {
        const { rerender } = render(<PasswordRules password='ontap' />)
        const live = document.querySelector('[aria-live="polite"]') as HTMLElement
        expect(live).toBeEmptyDOMElement()

        rerender(<PasswordRules password='Ontap' />)
        expect(live).toHaveTextContent(/Một chữ hoa/)
    })

    it('has no accessibility violations', async () => {
        const { container } = render(<PasswordRules password='Ontap2' showErrors />)
        await expectNoA11yViolations(container)
    })
})
