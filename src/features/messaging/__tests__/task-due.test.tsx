import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { expectNoA11yViolations } from '@/test/a11y'
import { SystemMessageRow } from '../components/SystemMessageRow'
import { reminderPeople, shortTaskTitle } from '../lib/task-due'
import type { Message, MessageAuthor } from '../types'

const ZONE = 'Asia/Ho_Chi_Minh'
const NOW = new Date('2026-10-17T21:47:00+07:00')
const person = (id: string, displayName: string | null): MessageAuthor => ({
    id,
    username: displayName ? `${id}.x` : null,
    displayName,
    avatarUrl: null
})
const AN = person('an', 'An')
const BINH = person('binh', 'Bình')
const CHI = person('chi', 'Chi')
const SEVEN = [
    BINH,
    CHI,
    person('dung', 'Dũng'),
    AN,
    person('giang', 'Giang'),
    person('ha', 'Hà'),
    person('khanh', 'Khánh')
]

/** The reminder sent at 23:59 yesterday (05 S-TASK-01 › Tin nhắc hạn). */
const reminder = (title: string, users: MessageAuthor[], mark: '24h' | '2h' = '24h'): Message => ({
    attachments: [],
    id: 'm9',
    channelId: 'viec-nhom',
    type: 'system',
    author: null,
    content: '',
    mentionUsers: [],
    mentionRoles: [],
    mentionEveryone: false,
    mentionHereUserIds: [],
    systemEvent: 'task_due',
    systemData: {
        taskId: 't1',
        title,
        reminder: mark,
        dueAt: '2026-10-17T16:59:00.000Z',
        userIds: users.map((one) => one.id)
    },
    systemUser: null,
    systemUsers: users,
    pinned: false,
    reactions: [],
    replyTo: null,
    editedAt: null,
    createdAt: '2026-10-16T16:59:00.000Z'
})

function renderRow(message: Message, me = 'an') {
    const onShowTask = vi.fn()
    const view = render(
        <TooltipProvider>
            <div role='log' aria-label='viec-nhom'>
                <SystemMessageRow
                    rowKey={message.id}
                    message={message}
                    now={NOW}
                    timeZone={ZONE}
                    tabbable
                    me={me}
                    onShow={vi.fn()}
                    onShowTask={onShowTask}
                />
            </div>
        </TooltipProvider>
    )
    return { ...view, onShowTask }
}

beforeAll(async () => {
    await i18n.changeLanguage('vi')
})

describe('shortTaskTitle', () => {
    it('keeps a title of 60 characters or fewer', () => {
        expect(shortTaskTitle('Ôn chương 4 — tích phân bội')).toBe('Ôn chương 4 — tích phân bội')
        expect(shortTaskTitle('x'.repeat(60))).toBe('x'.repeat(60))
    })

    it('cuts a longer one at a word boundary within 60 characters, then "…" (05 reminder-long)', () => {
        expect(
            shortTaskTitle('Tổng hợp đề cương ôn tập chương 1–5 và giải toàn bộ bài tập cuối chương trong giáo trình')
        ).toBe('Tổng hợp đề cương ôn tập chương 1–5 và giải toàn bộ bài tập…')
        // The 60th character is inside "tổng": the word goes whole.
        expect(shortTaskTitle('Đọc lại toàn bộ giáo trình chương một đến chương năm rồi tổng hợp công thức')).toBe(
            'Đọc lại toàn bộ giáo trình chương một đến chương năm rồi…'
        )
        expect(shortTaskTitle('y'.repeat(70))).toBe(`${'y'.repeat(60)}…`)
    })
})

describe('reminderPeople', () => {
    it('names up to 3, oneself first when on it, then in the order given; the rest counted', () => {
        expect(reminderPeople(SEVEN, 'an')).toEqual({ shown: [AN, BINH, CHI], others: 4 })
        expect(reminderPeople([AN, CHI], 'binh')).toEqual({ shown: [AN, CHI], others: 0 })
        expect(reminderPeople([BINH, CHI, AN], undefined)).toEqual({ shown: [BINH, CHI, AN], others: 0 })
    })
})

describe('The due-date reminder in the channel (05 S-TASK-01, REQ-MSG-08)', () => {
    it('says the time left, the task, who is on it and when; "Xem việc" opens the task', async () => {
        const user = userEvent.setup()
        const { container, onShowTask } = renderRow(reminder('Ôn chương 4 — tích phân bội', [AN, CHI]))

        const row = screen.getByRole('article')
        expect(row).toHaveTextContent('Còn 24 giờ tới hạn: Ôn chương 4 — tích phân bội · An, Chi · Hôm qua 23:59')
        expect(screen.getByText('Ôn chương 4 — tích phân bội')).toHaveClass('font-medium', 'text-text-primary')
        expect(row).toHaveAccessibleName(/^Còn 24 giờ tới hạn: Ôn chương 4 — tích phân bội · An, Chi, Hôm qua 23:59$/)

        // Named by its task: several reminders in a channel are told apart.
        await user.click(screen.getByRole('button', { name: 'Xem việc Ôn chương 4 — tích phân bội' }))
        expect(onShowTask).toHaveBeenCalledWith('t1')
        await expectNoA11yViolations(container)
    })

    it('cuts a long title, names 3 and counts the rest, and says 2 hours', () => {
        renderRow(
            reminder(
                'Tổng hợp đề cương ôn tập chương 1–5 và giải toàn bộ bài tập cuối chương trong giáo trình',
                SEVEN,
                '2h'
            )
        )

        expect(screen.getByRole('article')).toHaveTextContent(
            'Còn 2 giờ tới hạn: Tổng hợp đề cương ôn tập chương 1–5 và giải toàn bộ bài tập… · An, Bình, Chi và 4 người khác · Hôm qua 23:59'
        )
    })

    it('names a deleted account so', () => {
        renderRow(reminder('Nộp báo cáo', [person('gone', null)]))
        expect(screen.getByRole('article')).toHaveTextContent('· Tài khoản đã bị xóa ·')
    })

    it('says no one when it names no one, with no empty part between the dots', () => {
        renderRow(reminder('Nộp báo cáo', []))
        expect(screen.getByRole('article')).toHaveTextContent(/^Còn 24 giờ tới hạn: Nộp báo cáo · Hôm qua 23:59/)
        expect(screen.getByRole('article')).toHaveAccessibleName('Còn 24 giờ tới hạn: Nộp báo cáo, Hôm qua 23:59')
    })

    it('has no "Xem việc" where no task can be opened', () => {
        render(
            <TooltipProvider>
                <SystemMessageRow
                    rowKey='m9'
                    message={reminder('Nộp báo cáo', [AN])}
                    now={NOW}
                    timeZone={ZONE}
                    tabbable
                    me='an'
                    onShow={vi.fn()}
                />
            </TooltipProvider>
        )
        expect(screen.getByRole('article')).toHaveTextContent('Còn 24 giờ tới hạn: Nộp báo cáo · An')
        expect(screen.queryByRole('button', { name: /^Xem việc/ })).not.toBeInTheDocument()
    })
})
