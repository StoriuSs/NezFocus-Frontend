import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/i18n'
import { chooseRoomView, useVoiceStore, type RoomPerson } from '@/features/voice'
import { expectNoA11yViolations } from '@/test/a11y'
import { HostChip, RoomViewSwitch } from '../components/RoomHeader'

const person = (id: string, displayName: string): RoomPerson => ({
    user: { id, username: id, displayName, avatarUrl: null },
    roleIds: [],
    isOwner: false,
    joinedAt: '2026-11-22T14:05:00.000Z',
    micOn: false,
    cameraOn: false,
    screenSharing: false,
    modMuted: false
})
const session = (hostId: string | null) => ({
    id: 's1',
    hostId,
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: null,
    longBreakEvery: null,
    status: 'running' as const,
    phase: 'focus' as const,
    phaseIndex: 2,
    phaseStartedAt: '2026-11-22T14:41:00.000Z',
    phaseEndsAt: '2026-11-22T15:06:00.000Z',
    pausedRemainingMs: null,
    stretchStartedAt: null,
    startedAt: '2026-11-22T14:11:00.000Z',
    version: 3,
    serverTime: '2026-11-22T14:47:18.000Z'
})
const PEOPLE = [person('an', 'An'), person('binh', 'Bình')]

beforeAll(async () => {
    await i18n.changeLanguage('vi')
})
afterAll(async () => {
    await i18n.changeLanguage('en')
})
afterEach(() => chooseRoomView('ring'))

describe("A study room's Header (C-04, C-26a view, D-55)", () => {
    it('says who controls the session: oneself, someone in the room, or no one', () => {
        const { rerender, container } = render(<HostChip session={session('an')} people={PEOPLE} me='an' />)
        expect(screen.getByText('Bạn đang điều khiển')).toBeVisible()
        rerender(<HostChip session={session('binh')} people={PEOPLE} me='an' />)
        expect(screen.getByText('Bình đang điều khiển')).toBeVisible()
        rerender(<HostChip session={session(null)} people={PEOPLE} me='an' />)
        expect(screen.getByText('Chưa có người điều khiển')).toBeVisible()
        // A Host away from the room's list (kept 3 minutes): no chip.
        rerender(<HostChip session={session('chi')} people={PEOPLE} me='an' />)
        expect(container).toBeEmptyDOMElement()
    })

    it('switches between ring and grid, with the cameras on, and remembers it', async () => {
        render(<RoomViewSwitch cameras={1} />)
        expect(screen.getByRole('radio', { name: 'Vòng' })).toBeChecked()
        await expectNoA11yViolations(document.body)
        await userEvent.click(screen.getByRole('radio', { name: /Lưới/ }))
        expect(screen.getByRole('radio', { name: /Lưới.*1 người bật camera/ })).toBeChecked()
        expect(useVoiceStore.getState().roomView).toBe('grid')
    })
})
