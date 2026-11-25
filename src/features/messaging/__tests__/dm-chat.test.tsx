import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import type { ChatPermissions, DmChatParts, MentionSource, Message, MessageCursor, MessagePage } from '../types'

const NO_MENTIONS: MentionSource = {
    members: () => ({ queryKey: ['test', 'members'], queryFn: async () => [] }),
    roles: { queryKey: ['test', 'roles'], queryFn: async () => [] },
    channels: [],
    channel: () => ({ kind: 'hidden' }),
    roleIds: []
}

const messagesApi = {
    fetchMessages: vi.fn<(channelId: string, cursor: MessageCursor, limit?: number) => Promise<MessagePage>>(),
    sendMessage: vi.fn()
}
vi.mock('../api/messages.api', () => messagesApi)

const { default: ChannelChat } = await import('../components/ChannelChat')
const { ComposerDisabled } = await import('../components/ComposerDisabled')

const ZONE = 'Asia/Ho_Chi_Minh'
const person = (id: string, displayName: string) => ({ id, username: `${id}.le`, displayName, avatarUrl: null })
const KHANH = person('khanh', 'Khánh')
const AN = person('an', 'An')
const message = (id: string, author: Message['author'], content: string, more: Partial<Message> = {}): Message => ({
    attachments: [],
    id,
    channelId: 'dm-khanh',
    type: 'regular',
    author,
    content,
    mentionUsers: [],
    mentionRoles: [],
    mentionEveryone: false,
    mentionHereUserIds: [],
    systemEvent: null,
    systemData: null,
    systemUser: null,
    systemUsers: [],
    pinned: false,
    reactions: [],
    replyTo: null,
    editedAt: null,
    createdAt: new Date().toISOString(),
    ...more
})
const page = (items: Message[]): MessagePage => ({ items, hasMoreBefore: false, hasMoreAfter: false })

const OPEN: ChatPermissions = {
    attachFiles: true,
    send: true,
    sendBlocked: null,
    manage: false,
    pins: true,
    deleteOwn: true,
    react: true,
    addReactions: true,
    mentionEveryone: false
}

function renderDm(dm: DmChatParts, permissions: ChatPermissions = OPEN) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(userKeys.profile(), { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null })
    client.setQueryData(userKeys.settings(), { timezone: ZONE })
    return render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <div className='flex h-[600px] flex-col'>
                    <ChannelChat
                        channelId='dm-khanh'
                        serverId={null}
                        channelName='Khánh'
                        linkTo={(id) => `/dm/dm-khanh/${id}`}
                        readLink={() => null}
                        mentions={NO_MENTIONS}
                        permissions={permissions}
                        dm={dm}
                    />
                </div>
            </TooltipProvider>
        </QueryClientProvider>
    )
}

describe("A DM's chat (S-DM-03, D-249)", () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        messagesApi.fetchMessages.mockReset()
        sessionStorage.clear()
    })

    it('names the person with no "#", starts with its own beginning, and says "Nhắn Khánh"', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([message('m1', KHANH, 'Chào An')]))
        const { container } = renderDm({ intro: <h2>Khối đầu của Khánh</h2> })

        const log = await screen.findByRole('log', { name: 'Tin nhắn với Khánh' })
        expect(await within(log).findByText('Chào An')).toBeInTheDocument()
        expect(within(log).getByRole('heading', { name: 'Khối đầu của Khánh' })).toBeInTheDocument()
        expect(within(log).queryByRole('heading', { name: /Chào mừng tới/ })).toBeNull()
        expect(screen.getByPlaceholderText('Nhắn Khánh')).toBeInTheDocument()
        await expectNoA11yViolations(container)
    })

    it("hides the blocked person's messages and the system ones about them, with the strip in the composer's place", async () => {
        messagesApi.fetchMessages.mockResolvedValue(
            page([
                message('m1', AN, 'Chào Khánh'),
                message('m2', KHANH, 'Đề giữa kỳ có đáp án nè, 50k'),
                message('m3', null, '', { type: 'system', systemEvent: 'call_ended', systemData: { userId: 'khanh' } }),
                message('m4', AN, 'Thôi nhé')
            ])
        )
        renderDm({
            intro: <h2>Khối đầu của Khánh</h2>,
            footer: <p>Bạn đã chặn Khánh</p>,
            hidden: 'khanh'
        })

        const log = await screen.findByRole('log', { name: 'Tin nhắn với Khánh' })
        expect(await within(log).findByText('Chào Khánh')).toBeInTheDocument()
        expect(within(log).getByText('Thôi nhé')).toBeInTheDocument()
        expect(within(log).queryByText('Đề giữa kỳ có đáp án nè, 50k')).toBeNull()
        // No "N blocked messages" line in a DM (S-DM-03 `blocked-by-me`).
        expect(within(log).queryByText(/bị chặn/)).toBeNull()
        expect(screen.getByText('Bạn đã chặn Khánh')).toBeInTheDocument()
        expect(screen.queryByPlaceholderText('Nhắn Khánh')).toBeNull()
    })

    it.each([
        ['cannot-message', 'Không thể gửi tin nhắn cho người dùng này'],
        ['deleted-account', 'Không thể gửi tin nhắn cho tài khoản đã bị xóa']
    ] as const)('locks the composer of a DM where %s with its one line (C-12 `disabled`)', async (reason, line) => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        renderDm(
            { intro: <h2>Khối đầu</h2> },
            { ...OPEN, send: false, react: false, addReactions: false, attachFiles: false, sendBlocked: { reason } }
        )

        expect(await screen.findByRole('status')).toHaveTextContent(line)
        expect(screen.queryByPlaceholderText('Nhắn Khánh')).toBeNull()
    })

    it('says the same lines in English', async () => {
        await i18n.changeLanguage('en')
        const { rerender } = render(<ComposerDisabled blocked={{ reason: 'cannot-message' }} now={new Date()} />)
        expect(screen.getByRole('status')).toHaveTextContent("You can't send messages to this user")
        rerender(<ComposerDisabled blocked={{ reason: 'deleted-account' }} now={new Date()} />)
        expect(screen.getByRole('status')).toHaveTextContent("You can't send messages to a deleted account")
    })
})
