import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { expectNoA11yViolations } from '@/test/a11y'

// The check itself: it must fail on a real problem, or every page test that
// relies on it proves nothing.
describe('expectNoA11yViolations', () => {
    it('passes markup with names and labels', async () => {
        const { container } = render(
            <form>
                <label htmlFor='email'>Email</label>
                <input id='email' type='email' />
                <button type='submit'>Sign in</button>
            </form>
        )
        await expectNoA11yViolations(container)
    })

    it('fails on a button with no name', async () => {
        const { container } = render(
            <button type='button'>
                <svg aria-hidden='true' />
            </button>
        )
        await expect(expectNoA11yViolations(container)).rejects.toThrow(/button-name/)
    })

    it('fails on an input with no label', async () => {
        const { container } = render(<input type='text' />)
        await expect(expectNoA11yViolations(container)).rejects.toThrow(/label/)
    })

    it('ignores best-practice findings outside WCAG A / AA', async () => {
        // Skipping from h1 to h4 is axe's heading-order, a best practice.
        const { container } = render(
            <div>
                <h1>Title</h1>
                <h4>Skipped</h4>
            </div>
        )
        await expectNoA11yViolations(container)
    })
})
