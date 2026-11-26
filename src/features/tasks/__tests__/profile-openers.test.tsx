import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createPortal } from 'react-dom'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { connectProfilePopover, type ProfilePopoverProps } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import { PersonRow } from '../components/PersonRow'

/** The popover as the AppShell would connect it, drawn in a portal as Radix draws it: here, only whom and where. */
connectProfilePopover(({ userId, serverId, name }: ProfilePopoverProps) =>
    createPortal(<p>{`profile of ${name} (${userId}) in ${serverId ?? 'no server'}`}</p>, document.body)
)

const minh = { id: 'minh', username: 'minh.do', displayName: 'Minh', avatarUrl: null }

describe("A task's people open their profile in the task's server (05 S-TASK-02 › Đi tới, D-253)", () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
    })

    it('the avatar and names are the button; what one may do on the row stays beside it', async () => {
        const user = userEvent.setup()
        const { container } = render(
            <TooltipProvider>
                <PersonRow person={minh} serverId='ot' me='an' lostAccess>
                    <button type='button'>Remove</button>
                </PersonRow>
            </TooltipProvider>
        )
        const button = screen.getByRole('button', { name: /Minh/ })
        expect(within(button).queryByRole('button', { name: 'Remove' })).toBeNull()

        await user.click(button)
        expect(await screen.findByText('profile of Minh (minh) in ot')).toBeInTheDocument()
        await expectNoA11yViolations(container)
    })

    it("a creator gone from the server opens it too, in the task's server", async () => {
        const user = userEvent.setup()
        render(
            <TooltipProvider>
                <PersonRow person={minh} serverId='ot' me='an' leftServer />
            </TooltipProvider>
        )
        await user.click(screen.getByRole('button', { name: /Minh/ }))
        expect(await screen.findByText('profile of Minh (minh) in ot')).toBeInTheDocument()
    })
})
