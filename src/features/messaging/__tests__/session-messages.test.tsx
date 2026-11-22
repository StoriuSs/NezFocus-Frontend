import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { expectNoA11yViolations } from '@/test/a11y'
import { isShownSystem, SystemMessageRow } from '../components/SystemMessageRow'
import type { Message } from '../types'

const ZONE = 'Asia/Ho_Chi_Minh'
const NOW = new Date('2026-11-22T21:47:00+07:00')

/** A study room's session message (07: 21:11 "An đã bắt đầu phiên học 25/5"; REQ-MSG-08, D-222). */
const notice = (
    systemEvent: string,
    systemData: Record<string, unknown>,
    at = '2026-11-22T14:11:00.000Z'
): Message => ({
    attachments: [],
    id: `m-${systemEvent}`,
    channelId: 'im-lang',
    type: 'system',
    author: null,
    content: '',
    mentionUsers: [],
    mentionRoles: [],
    mentionEveryone: false,
    mentionHereUserIds: [],
    systemEvent,
    systemData,
    systemUser:
        systemEvent === 'study_session_started'
            ? { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null }
            : null,
    systemUsers: [],
    pinned: false,
    reactions: [],
    replyTo: null,
    editedAt: null,
    createdAt: at
})

const row = (message: Message) =>
    render(
        <TooltipProvider>
            <div role='log' aria-label='Phòng học im lặng'>
                <SystemMessageRow
                    rowKey={message.id}
                    message={message}
                    now={NOW}
                    timeZone={ZONE}
                    tabbable
                    onShow={vi.fn()}
                />
            </div>
        </TooltipProvider>
    )

beforeAll(() => i18n.changeLanguage('vi'))

describe("a study room's session in its chat (REQ-MSG-08, 07)", () => {
    it('says who started it and its cycle, the name in 600', async () => {
        const started = notice('study_session_started', {
            userId: 'an',
            sessionId: 's1',
            focusMinutes: 25,
            shortBreakMinutes: 5
        })
        expect(isShownSystem(started)).toBe(true)
        row(started)
        expect(screen.getByRole('article', { name: 'An đã bắt đầu phiên học 25/5, 21:11' })).toBeVisible()
        expect(screen.getByText('An')).toHaveClass('font-semibold')
        await expectNoA11yViolations()
    })

    it('says it ended, naming no one: it may end by itself', () => {
        const ended = notice('study_session_ended', { sessionId: 's1', reason: 'empty' }, '2026-11-22T14:40:00.000Z')
        expect(isShownSystem(ended)).toBe(true)
        row(ended)
        expect(screen.getByRole('article', { name: 'Phiên học đã kết thúc, 21:40' })).toBeVisible()
    })
})
