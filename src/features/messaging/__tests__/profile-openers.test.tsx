import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { connectProfilePopover, userKeys, type ProfilePopoverProps } from '@/features/users'
import type { ChatPermissions, Message, MessageCursor, MessagePage, MentionSource } from '../types'

const messagesApi = {
    fetchMessages: vi.fn<(channelId: string, cursor: MessageCursor, limit?: number) => Promise<MessagePage>>()
}
vi.mock('../api/messages.api', () => messagesApi)

const { default: ChannelChat } = await import('../components/ChannelChat')

/** The popover as the AppShell would connect it, drawn in a portal as Radix draws it: here, only whom and where. */
connectProfilePopover(({ userId, serverId, name }: ProfilePopoverProps) =>
    createPortal(<p>{`profile of ${name} (${userId}) in ${serverId ?? 'no server'}`}</p>, document.body)
)

const AN = '0190a0b0-0000-7000-8000-00000000000a'
const BINH = '0190a0b0-0000-7000-8000-00000000000b'
const HOI_DAP = '0190a0b0-0000-7000-8000-0000000000c1'
const binh = { id: BINH, username: 'binh.tran', displayName: 'Bình', avatarUrl: null }

const message = (id: string, content: string, extra: Partial<Message> = {}): Message => ({
    attachments: [],
    id,
    channelId: HOI_DAP,
    type: 'regular',
    author: binh,
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
    createdAt: new Date(Date.UTC(2026, 10, 25, 13, 1)).toISOString(),
    ...extra
})

const SOURCE: MentionSource = {
    members: () => ({ queryKey: ['test', 'members'], queryFn: async () => [] }),
    roles: { queryKey: ['test', 'roles'], queryFn: async () => [] },
    channels: [],
    channel: () => ({ kind: 'hidden' }),
    roleIds: []
}
const PERMISSIONS: ChatPermissions = {
    attachFiles: true,
    send: true,
    sendBlocked: null,
    manage: false,
    pins: false,
    deleteOwn: true,
    react: true,
    addReactions: true,
    mentionEveryone: false
}

function renderChat(serverId: string | null) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(userKeys.profile(), { id: AN, username: 'an.nguyen', displayName: 'An', avatarUrl: null })
    client.setQueryData(userKeys.settings(), { timezone: 'Asia/Ho_Chi_Minh' })
    render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <MemoryRouter>
                    <div className='flex h-[600px] flex-col'>
                        <ChannelChat
                            channelId={HOI_DAP}
                            channelName='hoi-dap'
                            permissions={PERMISSIONS}
                            linkTo={(id) => `/channels/ot/${HOI_DAP}/${id}`}
                            readLink={() => null}
                            mentions={SOURCE}
                            serverId={serverId}
                        />
                    </div>
                </MemoryRouter>
            </TooltipProvider>
        </QueryClientProvider>
    )
}

describe("A message's people open their profile (S-CHAT-05, D-253)", () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        messagesApi.fetchMessages.mockReset()
        messagesApi.fetchMessages.mockResolvedValue({
            items: [
                message('m1', `hỏi <@${AN}> nhé`, {
                    mentionUsers: [{ id: AN, username: 'an.nguyen', displayName: 'An' }]
                })
            ],
            hasMoreBefore: false,
            hasMoreAfter: false
        })
    })

    it("the author's name opens their profile in the channel's server; the avatar too, off the Tab order", async () => {
        renderChat('ot')
        const user = userEvent.setup()
        const article = (await screen.findByText(/nhé/)).closest('article') as HTMLElement

        const avatar = within(article).getByRole('button', { name: "Bình's profile" })
        expect(avatar).toHaveAttribute('tabindex', '-1')
        await user.click(within(article).getByRole('button', { name: 'Bình' }))
        expect(await screen.findByText(`profile of Bình (${BINH}) in ot`)).toBeInTheDocument()
    })

    it('a person mentioned opens theirs; in a DM, outside any server', async () => {
        renderChat(null)
        const user = userEvent.setup()

        await user.click(await screen.findByRole('button', { name: '@An' }))
        expect(await screen.findByText(`profile of An (${AN}) in no server`)).toBeInTheDocument()
    })

    it("a right click in the popover is the browser's, not the message's menu", async () => {
        renderChat('ot')
        const user = userEvent.setup()
        const article = (await screen.findByText(/nhé/)).closest('article') as HTMLElement

        await user.click(within(article).getByRole('button', { name: 'Bình' }))
        const card = await screen.findByText(`profile of Bình (${BINH}) in ot`)
        expect(fireEvent.contextMenu(card)).toBe(true)
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
})
