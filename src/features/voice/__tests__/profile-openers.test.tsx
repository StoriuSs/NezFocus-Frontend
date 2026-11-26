import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createPortal } from 'react-dom'
import i18n from '@/i18n'
import { connectProfilePopover, type ProfilePopoverProps } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import RoomPeopleList from '../components/RoomPeopleList'
import type { RoomPerson } from '../types'

/** The popover as the AppShell would connect it, drawn in a portal as Radix draws it: here, only whom, where and on which side. */
connectProfilePopover(({ userId, serverId, name, side }: ProfilePopoverProps) =>
    createPortal(<p>{`profile of ${name} (${userId}) in ${serverId ?? 'no server'}, ${side}`}</p>, document.body)
)

const person = (id: string, name: string, on: Partial<RoomPerson> = {}): RoomPerson => ({
    user: { id, username: id, displayName: name, avatarUrl: null },
    roleIds: [],
    isOwner: false,
    joinedAt: '2026-11-18T14:40:00.000Z',
    micOn: false,
    cameraOn: false,
    screenSharing: false,
    modMuted: false,
    ...on
})

// The seats: voice-room.test.tsx, through the preview page (its last describe).
describe("The panel of a room's people opens their profile in the room's server (L8b2-b, D-253)", () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
    })

    it('a row of the panel "People in the room" is the button, the popover on its left; oneself by their name', async () => {
        const user = userEvent.setup()
        const { container } = render(
            <RoomPeopleList
                people={[person('an', 'An'), person('nam', 'Nam', { modMuted: true })]}
                me='an'
                hostId='an'
                order={['an', 'nam']}
                serverId='ot'
            />
        )
        const rows = screen.getAllByRole('listitem')
        expect(within(rows[1]!).getByRole('button', { name: 'Nam, muted by a moderator' })).toBeInTheDocument()
        await user.click(within(rows[0]!).getByRole('button', { name: 'You, In control, mic off' }))
        expect(await screen.findByText('profile of An (an) in ot, left')).toBeInTheDocument()
        await expectNoA11yViolations(container)
    })
})
