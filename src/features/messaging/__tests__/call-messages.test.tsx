import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { expectNoA11yViolations } from '@/test/a11y'
import { isShownSystem, SystemMessageRow } from '../components/SystemMessageRow'
import type { Message } from '../types'

const ZONE = 'Asia/Ho_Chi_Minh'
const NOW = new Date('2026-10-18T21:47:00+07:00')
const BINH = { id: 'binh', username: 'binh.tran', displayName: 'Bình', avatarUrl: null }
const AN = { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null }

/** A call's message in the DM An ↔ Bình (09 S-DM-03: 16:45 a missed call of Bình's, 16:59 An's of 12 minutes). */
const call = (caller: typeof BINH, more: Record<string, unknown>, at = '2026-10-18T09:45:00.000Z'): Message => ({
    attachments: [],
    id: `m-${caller.id}-${String(more.status)}`,
    channelId: 'dm-an-binh',
    type: 'system',
    author: null,
    content: '',
    mentionUsers: [],
    mentionRoles: [],
    mentionEveryone: false,
    mentionHereUserIds: [],
    systemEvent: 'call_ended',
    systemData: {
        userId: caller.id,
        callId: 'c1',
        status: 'ended',
        endReason: null,
        video: false,
        durationSeconds: null,
        ...more
    },
    systemUser: caller,
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
            <div role='log' aria-label='Tin nhắn với Bình'>
                <SystemMessageRow
                    rowKey={message.id}
                    message={message}
                    now={NOW}
                    timeZone={ZONE}
                    tabbable
                    me='an'
                    onShow={vi.fn()}
                />
            </div>
        </TooltipProvider>
    )

const icon = (article: HTMLElement) => article.querySelector('svg')!

beforeAll(() => i18n.changeLanguage('vi'))

describe("a call's message in the DM (09 Q4, D-250)", () => {
    it('says a missed call with who called, the icon phone-missed in danger', async () => {
        const missed = call(BINH, { status: 'missed', endReason: 'no_answer' })
        expect(isShownSystem(missed)).toBe(true)
        row(missed)
        const article = screen.getByRole('article', { name: 'Bình đã gọi · Cuộc gọi nhỡ, 16:45' })
        expect(screen.getByText('Bình')).toHaveClass('font-semibold')
        expect(icon(article)).toHaveClass('lucide-phone-missed', 'text-danger')
        await expectNoA11yViolations()
    })

    it('says "Bạn" for one I made, with how long it lasted, the icon phone', () => {
        row(call(AN, { durationSeconds: 12 * 60 + 40 }, '2026-10-18T09:59:00.000Z'))
        const article = screen.getByRole('article', { name: 'Bạn đã gọi · 12 phút, 16:59' })
        expect(icon(article)).toHaveClass('lucide-phone', 'text-text-tertiary')
    })

    it('says a video call, declined or not connected, with phone-off; a video one answered with video', () => {
        const { unmount } = row(call(AN, { status: 'declined', video: true }))
        expect(
            icon(screen.getByRole('article', { name: 'Bạn đã gọi video · Cuộc gọi bị từ chối, 16:45' }))
        ).toHaveClass('lucide-phone-off')
        unmount()
        const failed = row(call(AN, { status: 'failed' }))
        expect(screen.getByRole('article', { name: 'Bạn đã gọi · Không kết nối được, 16:45' })).toBeVisible()
        failed.unmount()
        row(call(BINH, { video: true, durationSeconds: 30 }))
        expect(icon(screen.getByRole('article', { name: 'Bình đã gọi video · dưới 1 phút, 16:45' }))).toHaveClass(
            'lucide-video'
        )
    })
})
