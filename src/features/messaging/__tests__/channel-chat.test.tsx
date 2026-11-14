import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import type { Message, MessageCursor, MessagePage } from '../types'

const messagesApi = {
    fetchMessages: vi.fn<(channelId: string, cursor: MessageCursor, limit?: number) => Promise<MessagePage>>(),
    sendMessage: vi.fn<(channelId: string, body: { content: string; nonce: string }, key: string) => Promise<Message>>()
}
vi.mock('../api/messages.api', () => messagesApi)

const { default: ChannelChat } = await import('../components/ChannelChat')
const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')

const ZONE = 'Asia/Ho_Chi_Minh'
const person = (id: string, displayName: string) => ({ id, username: `${id}.tran`, displayName, avatarUrl: null })
const BINH = person('binh', 'Bình')
const AN = person('an', 'An')
const today = (time: string) => {
    const now = new Date()
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(now)
    return new Date(`${day}T${time}:00+07:00`).toISOString()
}
const message = (id: string, author: typeof BINH, content: string, createdAt: string): Message => ({
    id,
    channelId: 'hoi-dap',
    type: 'regular',
    author,
    content,
    systemEvent: null,
    systemData: null,
    replyTo: null,
    editedAt: null,
    createdAt
})
const page = (items: Message[]): MessagePage => ({ items, hasMoreBefore: false, hasMoreAfter: false })

function renderChat(
    channelId = 'hoi-dap',
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    me = 'an'
) {
    client.setQueryData(userKeys.profile(), { id: me, username: `${me}.nguyen`, displayName: me, avatarUrl: null })
    client.setQueryData(userKeys.settings(), { timezone: ZONE })
    const view = render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <button type='button'>Nút khác</button>
                <div className='flex h-[600px] flex-col'>
                    <ChannelChat
                        key={channelId}
                        linkTo={(id) => `/channels/ot/${channelId}/${id}`}
                        readLink={() => null}
                        channelId={channelId}
                        channelName={channelId}
                        permissions={{ send: true, manage: false, deleteOwn: true }}
                    />
                </div>
            </TooltipProvider>
        </QueryClientProvider>
    )
    return { ...view, client }
}

describe('A text channel chat (S-CHAT-01)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        messagesApi.fetchMessages.mockReset()
        messagesApi.sendMessage.mockReset()
        sessionStorage.clear()
    })

    it('shows the history with its date line and groups, the channel start above it', async () => {
        messagesApi.fetchMessages.mockResolvedValue(
            page([
                message('m1', BINH, 'Mọi người ơi, câu 3 giải thế nào vậy?', today('20:02')),
                message('m2', BINH, 'Đề giữa kỳ năm ngoái', today('20:03')),
                message('m3', AN, 'Ok, mình vào sớm giữ chỗ', today('20:11'))
            ])
        )
        const { container } = renderChat()

        const log = await screen.findByRole('log', { name: 'Tin nhắn trong #hoi-dap' })
        expect(await within(log).findByRole('separator', { name: 'Hôm nay' })).toBeInTheDocument()
        expect(within(log).getByRole('heading', { name: 'Chào mừng tới #hoi-dap' })).toBeInTheDocument()
        // Bình's second message is grouped: one name for two messages.
        expect(within(log).getAllByText('Bình')).toHaveLength(1)
        expect(within(log).getByText('Đề giữa kỳ năm ngoái')).toBeInTheDocument()
        expect(messagesApi.fetchMessages).toHaveBeenCalledWith('hoi-dap', null)
        await expectNoA11yViolations(container)
    })

    it('says so when the history cannot be read, and reads it again on "Try again"', async () => {
        messagesApi.fetchMessages.mockRejectedValueOnce(apiError(503, 'SERVICE_UNAVAILABLE'))
        messagesApi.fetchMessages.mockResolvedValueOnce(page([]))
        const { container } = renderChat()

        const again = await screen.findByRole('button', { name: 'Thử lại' })
        await expectNoA11yViolations(container)
        await userEvent.click(again)

        expect(await screen.findByRole('heading', { name: 'Chào mừng tới #hoi-dap' })).toBeInTheDocument()
    })

    it('sends on Enter, keeps a new line on Shift+Enter, and shows the message at once', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        messagesApi.sendMessage.mockImplementation(async (_channel, body) =>
            message('m9', AN, body.content, new Date().toISOString())
        )
        renderChat()
        const box = await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' })
        expect(box).toHaveFocus()

        await userEvent.type(box, 'Dòng một{Shift>}{Enter}{/Shift}dòng hai{Enter}')

        await waitFor(() => expect(messagesApi.sendMessage).toHaveBeenCalledTimes(1))
        expect(messagesApi.sendMessage.mock.calls[0]![1].content).toBe('Dòng một\ndòng hai')
        expect(box).toHaveValue('')
        expect(await screen.findByText(/Dòng một\s+dòng hai/)).toBeInTheDocument()
    })

    it('says a message did not go, with "Try again" and "Discard"', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        messagesApi.sendMessage.mockRejectedValue(apiError(500, 'GENERIC_ERROR'))
        const { container } = renderChat()

        await userEvent.type(await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' }), 'Không đi{Enter}')

        const alert = await screen.findByRole('alert')
        expect(alert).toHaveTextContent('Không gửi được')
        expect(within(alert).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
        await userEvent.click(within(alert).getByRole('button', { name: 'Bỏ' }))
        expect(screen.queryByText('Không đi')).not.toBeInTheDocument()
        await expectNoA11yViolations(container)
    })

    it('counts down from 200 left, and refuses Enter past 2000 characters', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        renderChat()
        const box = await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' })

        await userEvent.click(box)
        await userEvent.paste('a'.repeat(1801))
        expect(screen.getByText('còn 199')).toBeInTheDocument()

        await userEvent.paste('a'.repeat(211))
        expect(screen.getByText('−12')).toBeInTheDocument()
        expect(box).toHaveAccessibleDescription('Tin nhắn dài quá 2000 ký tự')
        await expectNoA11yViolations(document.body)
        await userEvent.keyboard('{Enter}')
        expect(messagesApi.sendMessage).not.toHaveBeenCalled()
    })

    it('shows what someone else sends, heard on the socket', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([message('m1', BINH, 'Câu 4?', today('20:02'))]))
        renderChat()
        await screen.findByText('Câu 4?')

        act(() =>
            emitRealtimeEvent('message.created', { message: message('m2', BINH, 'Ai biết không?', today('20:03')) })
        )

        expect(await screen.findByText('Ai biết không?')).toBeInTheDocument()
    })

    it('sends a letter typed outside any field to the composer, but leaves Space to the button it presses', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        renderChat()
        const box = await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' })
        const other = screen.getByRole('button', { name: 'Nút khác' })

        other.focus()
        await userEvent.keyboard(' ')
        expect(other).toHaveFocus()

        await userEvent.keyboard('a')
        expect(box).toHaveFocus()
        expect(box).toHaveValue('a')
    })

    it('puts the cursor in the composer when the channel is opened with the mouse, not from the keyboard', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        await userEvent.keyboard('{Tab}')
        const byKeyboard = renderChat()
        expect(await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' })).not.toHaveFocus()
        byKeyboard.unmount()

        await userEvent.pointer({ keys: '[MouseLeft]', target: document.body })
        renderChat()
        expect(await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' })).toHaveFocus()
    })

    it('keeps the text when the history is not there yet to show the message', async () => {
        messagesApi.fetchMessages.mockReturnValue(new Promise(() => undefined))
        renderChat()
        const box = await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' })

        await userEvent.type(box, 'Gửi sớm quá{Enter}')

        expect(box).toHaveValue('Gửi sớm quá')
        expect(messagesApi.sendMessage).not.toHaveBeenCalled()
    })

    it('keeps what was typed in a channel for when one comes back to it', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        const first = renderChat('hoi-dap')
        await userEvent.type(await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' }), 'Nháp chưa gửi')
        first.unmount()

        renderChat('tai-lieu', first.client)
        expect(await screen.findByRole('textbox', { name: 'Nhắn #tai-lieu' })).toHaveValue('')
        renderChat('hoi-dap', first.client)
        expect(await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' })).toHaveValue('Nháp chưa gửi')
    })

    it("never shows one account's draft to the next one signed in, in the same tab", async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        const an = renderChat('hoi-dap')
        await userEvent.type(await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' }), 'Nháp của An')
        an.unmount()

        renderChat('hoi-dap', undefined, 'binh')

        expect(await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' })).toHaveValue('')
    })
})
