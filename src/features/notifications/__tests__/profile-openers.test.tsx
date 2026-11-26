import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createPortal } from 'react-dom'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { TooltipProvider } from '@/components/ui/tooltip'
import { connectProfilePopover, type ProfilePopoverProps } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import { NotificationRow } from '../components/NotificationRow'
import type { Notification } from '../types'

/** The popover as the AppShell would connect it, drawn in a portal (a child of the row in React's tree, as Radix's is). */
connectProfilePopover(({ userId, serverId, name }: ProfilePopoverProps) =>
    createPortal(<p>{`profile of ${name} (${userId}) in ${serverId ?? 'no server'}`}</p>, document.body)
)

const MINH = { id: 'minh', username: 'minh.x', displayName: 'Minh', avatarUrl: null }
const mention = (more: Partial<Notification> = {}): Notification => ({
    id: '0193a000-0000-7000-8000-000000000004',
    type: 'mention',
    serverId: 'ot',
    channelId: 'hoi-dap',
    messageId: 'm4',
    roleId: null,
    taskId: null,
    note: null,
    task: null,
    server: null,
    reason: 'user',
    actor: MINH,
    message: {
        id: 'm4',
        content: 'review giúp PR #12 nhé',
        mentionUsers: [],
        mentionRoles: [],
        files: { count: 0, images: 0 }
    },
    readAt: null,
    createdAt: '2026-11-26T14:20:00Z',
    ...more
})

/** The row in the inbox's Popover (C-15 `panel`), open; `closing` hears it asked to close. */
function renderRow(item: Notification, closing = vi.fn(), current = true) {
    render(
        <MemoryRouter>
            <TooltipProvider>
                <Popover open onOpenChange={closing}>
                    <PopoverAnchor />
                    <PopoverContent aria-label='Notifications'>
                        <NotificationRow
                            item={item}
                            text={{
                                title: 'Minh mentioned you',
                                content: 'review giúp PR #12 nhé',
                                source: null,
                                place: null
                            }}
                            time='21:20'
                            fullTime='Thursday, 26/11/2026 at 21:20'
                            to='/channels/ot/hoi-dap/m4'
                            current={current}
                            offline={false}
                            onOpen={() => undefined}
                            onMarkRead={() => undefined}
                            onFocus={() => undefined}
                            onKeyDown={() => undefined}
                            position={1}
                            setSize={1}
                        />
                    </PopoverContent>
                </Popover>
            </TooltipProvider>
        </MemoryRouter>
    )
    return closing
}

describe("An inbox row's avatar opens who did it (06 › Tương tác, D-253)", () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
    })

    it("outside a server, above the row's link; the inbox stays open, a click in the profile included", async () => {
        const user = userEvent.setup()
        const closing = renderRow(mention())

        await user.click(screen.getByRole('button', { name: "Minh's profile" }))
        const card = await screen.findByText('profile of Minh (minh) in no server')
        await user.click(card)
        expect(closing).not.toHaveBeenCalled()
        expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument()
        await expectNoA11yViolations()
    })

    it("keeps to the feed's Tab stops: only the row keyboard focus is on lets Tab reach its avatar (06 › Bàn phím)", () => {
        renderRow(mention(), vi.fn(), false)
        expect(screen.getByRole('button', { name: "Minh's profile" })).toHaveAttribute('tabindex', '-1')
    })

    it('a deleted account has no avatar to open', () => {
        renderRow(mention({ actor: null }))
        expect(screen.queryByRole('button', { name: /profile/ })).not.toBeInTheDocument()
    })
})
