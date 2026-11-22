import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import i18n from '@/i18n'
import { noteServerTime } from '@/lib/server-clock'
import { AT, session } from '@/test/study-sessions'
import { PhaseListLine } from '../components/channel-list/PhaseListLine'

beforeAll(() => i18n.changeLanguage('vi'))
afterEach(() => vi.useRealTimers())

describe("a room's phase in the channel list (PhaseListLine, C-06 focus-running, C-19 list)", () => {
    it('says the phase and the minutes left, again as the minute changes, and no number while paused', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
        vi.setSystemTime(AT)
        noteServerTime(session().serverTime)
        const view = render(<PhaseListLine session={session()} />)
        expect(screen.getByText('Tập trung')).toHaveClass('truncate')
        const left = () => screen.getByText('Tập trung').nextElementSibling?.textContent
        expect(left()).toBe(' · còn 18 phút')
        // The number in the numeric face (the .pen's PhaseBadge/S).
        expect(screen.getByText('18')).toHaveClass('font-numeric')
        expect(screen.getByText('Tập trung').parentElement?.parentElement).toHaveClass('text-phase-focus')
        act(() => {
            vi.advanceTimersByTime(42_000)
        })
        expect(left()).toBe(' · còn 18 phút')
        act(() => {
            vi.advanceTimersByTime(1_100)
        })
        expect(left()).toBe(' · còn 17 phút')
        act(() => {
            vi.advanceTimersByTime((17 * 60 + 1) * 1000)
        })
        expect(left()).toBe(' · còn dưới 1 phút')

        view.rerender(
            <PhaseListLine session={session({ status: 'paused', phaseEndsAt: null, pausedRemainingMs: 9 })} />
        )
        expect(screen.getByText('Tạm dừng').parentElement?.parentElement).toHaveClass('text-text-secondary')
        expect(screen.queryByText(/còn/)).toBeNull()
    })
})
