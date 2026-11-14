import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import type { ChatPermissions, Message, MessageCursor, MessagePage } from '../types'

const messagesApi = {
    fetchMessages: vi.fn<(channelId: string, cursor: MessageCursor, limit?: number) => Promise<MessagePage>>(),
    sendMessage:
        vi.fn<
            (
                channelId: string,
                body: { content: string; nonce: string; replyToId?: string },
                key: string
            ) => Promise<Message>
        >(),
    editMessage: vi.fn<(messageId: string, content: string) => Promise<Message>>(),
    deleteMessage: vi.fn<(messageId: string) => Promise<void>>()
}
vi.mock('../api/messages.api', () => messagesApi)

const { default: ChannelChat } = await import('../components/ChannelChat')
const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')

const ZONE = 'Asia/Ho_Chi_Minh'
const person = (id: string, displayName: string) => ({ id, username: `${id}.tran`, displayName, avatarUrl: null })
const AN = person('an', 'An')
const TUAN = person('tuan', 'Tuấn')
const at = (time: string) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date())
    return new Date(`${day}T${time}:00+07:00`).toISOString()
}
const message = (id: string, author: typeof AN, content: string, time: string): Message => ({
    id,
    channelId: 'hoi-dap',
    type: 'regular',
    author,
    content,
    systemEvent: null,
    systemData: null,
    systemUser: null,
    pinned: false,
    reactions: [],
    replyTo: null,
    editedAt: null,
    createdAt: at(time)
})
const MINE = message('m1', AN, 'Ok, mình vào sớm giữ chỗ', '20:11')
const THEIRS = message('m2', TUAN, 'Câu 4 đổi cận thế nào vậy mọi người?', '21:45')

const MEMBER: ChatPermissions = { send: true, manage: false, deleteOwn: true, react: true, addReactions: true }
const MODERATOR: ChatPermissions = { send: true, manage: true, deleteOwn: true, react: true, addReactions: true }
const TIMED_OUT: ChatPermissions = { send: false, manage: false, deleteOwn: false, react: false, addReactions: false }

function renderChat(permissions: ChatPermissions = MEMBER) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    client.setQueryData(userKeys.profile(), { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null })
    client.setQueryData(userKeys.settings(), { timezone: ZONE })
    const view = render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <div className='flex h-[600px] flex-col'>
                    <ChannelChat
                        channelId='hoi-dap'
                        channelName='hoi-dap'
                        permissions={permissions}
                        linkTo={(id) => `${window.location.origin}/channels/ot/hoi-dap/${id}`}
                        readLink={() => null}
                    />
                </div>
                <Toaster />
            </TooltipProvider>
        </QueryClientProvider>
    )
    return { ...view, client }
}

const row = async (text: string) => (await screen.findByText(text)).closest('article') as HTMLElement
/** The "More" button of a message's toolbar, then the menu it opens. */
async function openMenu(text: string) {
    await userEvent.click(within(await row(text)).getByRole('button', { name: 'Thêm' }))
    return screen.findByRole('menu')
}
const items = (menu: HTMLElement) =>
    within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent)

describe('The actions on a message (S-CHAT-03, C-11)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        Object.values(messagesApi).forEach((fn) => fn.mockReset())
        messagesApi.fetchMessages.mockResolvedValue({
            items: [MINE, THEIRS],
            hasMoreBefore: false,
            hasMoreAfter: false
        })
        sessionStorage.clear()
    })
    afterEach(() => vi.restoreAllMocks())

    it("offers on one's own message: Edit, Reply, the copies and Delete", async () => {
        const { container } = renderChat()

        const menu = await openMenu(MINE.content)

        expect(items(menu)).toEqual([
            'Sửa↑',
            'Trả lời',
            'Thêm cảm xúc',
            'Sao chép chữ',
            'Sao chép link tin',
            'Xóa tin nhắn'
        ])
        await expectNoA11yViolations()
        await expectNoA11yViolations(container)
    })

    it("offers on someone else's message no Edit, and Delete only with MANAGE_MESSAGES", async () => {
        renderChat()
        expect(items(await openMenu(THEIRS.content))).toEqual([
            'Trả lời',
            'Thêm cảm xúc',
            'Sao chép chữ',
            'Sao chép link tin'
        ])
    })

    it("lets a moderator delete someone else's message", async () => {
        renderChat(MODERATOR)
        expect(items(await openMenu(THEIRS.content))).toContain('Xóa tin nhắn')
    })

    it('leaves a timed-out member only the copies: no Reply on the toolbar, no Edit or Delete', async () => {
        renderChat(TIMED_OUT)
        const mine = await row(MINE.content)

        expect(within(mine).queryByRole('button', { name: 'Trả lời' })).not.toBeInTheDocument()
        expect(items(await openMenu(MINE.content))).toEqual(['Sao chép chữ', 'Sao chép link tin'])
    })

    it('opens the same menu on a right-click, and on Shift+F10 from the message', async () => {
        renderChat()

        fireEvent.contextMenu(await row(THEIRS.content))
        expect(items(await screen.findByRole('menu'))).toContain('Trả lời')
        await userEvent.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
        ;(await row(MINE.content)).focus()
        await userEvent.keyboard('{Shift>}{F10}{/Shift}')
        expect(items(await screen.findByRole('menu'))).toContain('Sửa↑')
    })

    it('keeps the toolbar out of the Tab order: Tab reaches one message, its actions through the menu', async () => {
        renderChat()
        for (const button of within(await row(MINE.content)).getAllByRole('button')) {
            expect(button).toHaveAttribute('tabindex', '-1')
        }
    })

    it('puts the cursor in the composer after Reply from the menu', async () => {
        renderChat()
        await userEvent.click(within(await openMenu(THEIRS.content)).getByRole('menuitem', { name: 'Trả lời' }))

        await waitFor(() => expect(screen.getByRole('textbox', { name: 'Nhắn #hoi-dap' })).toHaveFocus())
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(screen.getByRole('textbox', { name: 'Nhắn #hoi-dap' })).toHaveFocus()
    })

    it('puts the cursor in the editor after Edit from a right-click', async () => {
        renderChat()
        fireEvent.contextMenu(await row(MINE.content))
        await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: /Sửa/ }))

        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(screen.getByRole('textbox', { name: 'Sửa tin nhắn' })).toHaveFocus()
    })

    it('says that copying failed when the browser refuses', async () => {
        const writeText = vi.fn().mockRejectedValue(new Error('denied'))
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        renderChat()

        await userEvent.click(within(await openMenu(THEIRS.content)).getByRole('menuitem', { name: 'Sao chép chữ' }))

        expect(await screen.findByText('Không sao chép được')).toBeInTheDocument()
    })

    it('copies the text, and the link to the message, saying so', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        renderChat()

        await userEvent.click(within(await openMenu(THEIRS.content)).getByRole('menuitem', { name: 'Sao chép chữ' }))
        expect(writeText).toHaveBeenLastCalledWith(THEIRS.content)
        expect(await screen.findByText('Đã sao chép')).toBeInTheDocument()

        await userEvent.click(
            within(await openMenu(THEIRS.content)).getByRole('menuitem', { name: 'Sao chép link tin' })
        )
        expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/channels/ot/hoi-dap/m2`)
    })
})

describe('Editing in place (S-CHAT-01 edit-mode, C-10 editing)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        Object.values(messagesApi).forEach((fn) => fn.mockReset())
        messagesApi.fetchMessages.mockResolvedValue({
            items: [MINE, THEIRS],
            hasMoreBefore: false,
            hasMoreAfter: false
        })
        messagesApi.editMessage.mockImplementation(async (id, content) => ({
            ...MINE,
            id,
            content,
            editedAt: new Date().toISOString()
        }))
        sessionStorage.clear()
    })

    it('saves on Enter, the message then marked edited', async () => {
        const { container } = renderChat()
        await userEvent.click(within(await openMenu(MINE.content)).getByRole('menuitem', { name: /Sửa/ }))

        const editor = screen.getByRole('textbox', { name: 'Sửa tin nhắn' })
        expect(editor).toHaveValue(MINE.content)
        expect(editor).toHaveFocus()
        expect(screen.getByText('Esc để hủy · Enter để lưu')).toBeInTheDocument()
        await expectNoA11yViolations(container)

        await userEvent.clear(editor)
        await userEvent.type(editor, 'Mình vào phòng rồi nhé{Enter}')

        expect(messagesApi.editMessage).toHaveBeenCalledWith('m1', 'Mình vào phòng rồi nhé')
        expect(await screen.findByText('Mình vào phòng rồi nhé')).toBeInTheDocument()
        expect(screen.getByText('(đã chỉnh sửa)')).toBeInTheDocument()
        expect(screen.queryByRole('textbox', { name: 'Sửa tin nhắn' })).not.toBeInTheDocument()
    })

    it('starts on ↑ in the empty composer, with the last message of one’s own; Esc leaves it as it was', async () => {
        renderChat()
        const composer = await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' })
        await screen.findByText(MINE.content)

        await userEvent.type(composer, '{ArrowUp}')
        const editor = screen.getByRole('textbox', { name: 'Sửa tin nhắn' })
        await userEvent.type(editor, ' thêm chữ{Escape}')

        expect(screen.queryByRole('textbox', { name: 'Sửa tin nhắn' })).not.toBeInTheDocument()
        expect(screen.getByText(MINE.content)).toBeInTheDocument()
        expect(messagesApi.editMessage).not.toHaveBeenCalled()
        expect(composer).toHaveFocus()
    })

    it('sends nothing when the text did not change', async () => {
        renderChat()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' }), '{ArrowUp}')
        await userEvent.type(screen.getByRole('textbox', { name: 'Sửa tin nhắn' }), '{Enter}')

        expect(screen.queryByRole('textbox', { name: 'Sửa tin nhắn' })).not.toBeInTheDocument()
        expect(messagesApi.editMessage).not.toHaveBeenCalled()
    })

    it('asks to delete when saved empty', async () => {
        renderChat()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' }), '{ArrowUp}')
        const editor = screen.getByRole('textbox', { name: 'Sửa tin nhắn' })
        await userEvent.clear(editor)
        await userEvent.type(editor, '{Enter}')

        expect(await screen.findByRole('dialog', { name: 'Xóa tin nhắn?' })).toBeInTheDocument()
        expect(messagesApi.editMessage).not.toHaveBeenCalled()
    })

    it('stops, saying so, when the message is deleted elsewhere meanwhile', async () => {
        renderChat()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' }), '{ArrowUp}')

        act(() => emitRealtimeEvent('message.deleted', { id: 'm1', channelId: 'hoi-dap' }))

        expect(await screen.findByText('Tin nhắn này đã bị xóa')).toBeInTheDocument()
        expect(screen.queryByRole('textbox', { name: 'Sửa tin nhắn' })).not.toBeInTheDocument()
    })

    it('says once that the message was deleted when the edit finds it gone', async () => {
        messagesApi.editMessage.mockRejectedValueOnce(apiError(404, 'NOT_FOUND_ERROR'))
        renderChat()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' }), '{ArrowUp}')

        await userEvent.type(screen.getByRole('textbox', { name: 'Sửa tin nhắn' }), '!{Enter}')

        expect(await screen.findByText('Tin nhắn này đã bị xóa')).toBeInTheDocument()
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(screen.getAllByText('Tin nhắn này đã bị xóa')).toHaveLength(1)
        expect(screen.queryByText(MINE.content)).not.toBeInTheDocument()
    })

    it('says nothing when one deletes the message one was editing, whatever arrives first', async () => {
        messagesApi.deleteMessage.mockImplementation(async (id) => {
            act(() => emitRealtimeEvent('message.deleted', { id, channelId: 'hoi-dap' }))
        })
        renderChat()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' }), '{ArrowUp}')
        const editor = screen.getByRole('textbox', { name: 'Sửa tin nhắn' })
        await userEvent.clear(editor)
        await userEvent.type(editor, '{Enter}')
        await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Xóa' }))

        await waitFor(() => expect(screen.queryByText(MINE.content)).not.toBeInTheDocument())
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(screen.queryByText('Tin nhắn này đã bị xóa')).not.toBeInTheDocument()
    })

    it('says why an edit was refused, keeping the text being edited', async () => {
        messagesApi.editMessage.mockRejectedValueOnce(apiError(403, 'MEMBER_TIMED_OUT'))
        renderChat()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Nhắn #hoi-dap' }), '{ArrowUp}')
        const editor = screen.getByRole('textbox', { name: 'Sửa tin nhắn' })

        await userEvent.type(editor, '!{Enter}')

        await waitFor(() => expect(messagesApi.editMessage).toHaveBeenCalled())
        expect(screen.getByRole('textbox', { name: 'Sửa tin nhắn' })).toHaveValue(`${MINE.content}!`)
    })
})

describe('Deleting (S-CHAT-03 delete-confirm)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        Object.values(messagesApi).forEach((fn) => fn.mockReset())
        messagesApi.fetchMessages.mockResolvedValue({
            items: [MINE, THEIRS],
            hasMoreBefore: false,
            hasMoreAfter: false
        })
        messagesApi.deleteMessage.mockResolvedValue(undefined)
        sessionStorage.clear()
    })

    it('asks first, quoting the message, then it leaves the list', async () => {
        renderChat(MODERATOR)
        await userEvent.click(within(await openMenu(THEIRS.content)).getByRole('menuitem', { name: 'Xóa tin nhắn' }))

        const dialog = await screen.findByRole('dialog', { name: 'Xóa tin nhắn?' })
        expect(within(dialog).getByText('Tin của Tuấn sẽ bị xóa với mọi người trong kênh.')).toBeInTheDocument()
        expect(within(dialog).getByText(THEIRS.content)).toBeInTheDocument()
        expect(within(dialog).getByText('21:45')).toBeInTheDocument()
        await expectNoA11yViolations()
        await userEvent.click(within(dialog).getByRole('button', { name: 'Xóa' }))

        expect(messagesApi.deleteMessage).toHaveBeenCalledWith('m2')
        await waitFor(() => expect(within(screen.getByRole('log')).queryByText(THEIRS.content)).not.toBeInTheDocument())
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('says why a delete failed, keeping the message', async () => {
        messagesApi.deleteMessage.mockRejectedValueOnce(apiError(500, 'GENERIC_ERROR'))
        renderChat(MODERATOR)
        await userEvent.click(within(await openMenu(THEIRS.content)).getByRole('menuitem', { name: 'Xóa tin nhắn' }))
        await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Xóa' }))

        expect(await screen.findByText(i18n.t('api:GENERIC_ERROR'))).toBeInTheDocument()
        expect(within(screen.getByRole('log')).getByText(THEIRS.content)).toBeInTheDocument()
    })

    it('puts focus back on the message when the dialog is cancelled', async () => {
        renderChat()
        const mine = await row(MINE.content)
        mine.focus()
        await userEvent.keyboard('{Shift>}{F10}{/Shift}')
        await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Xóa tin nhắn' }))
        await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Hủy' }))

        await waitFor(() => expect(mine).toHaveFocus())
    })

    it("says 'your message' on one's own, and Cancel keeps it", async () => {
        renderChat()
        await userEvent.click(within(await openMenu(MINE.content)).getByRole('menuitem', { name: 'Xóa tin nhắn' }))

        const dialog = await screen.findByRole('dialog', { name: 'Xóa tin nhắn?' })
        expect(within(dialog).getByText('Tin của bạn sẽ bị xóa với mọi người trong kênh.')).toBeInTheDocument()
        await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))

        expect(messagesApi.deleteMessage).not.toHaveBeenCalled()
        expect(screen.getByText(MINE.content)).toBeInTheDocument()
    })
})

describe('Replying (S-CHAT-01 reply-mode, C-10 reply)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        Object.values(messagesApi).forEach((fn) => fn.mockReset())
        messagesApi.fetchMessages.mockResolvedValue({
            items: [MINE, THEIRS],
            hasMoreBefore: false,
            hasMoreAfter: false
        })
        messagesApi.sendMessage.mockImplementation(async (_channel, body) => ({
            ...message('m3', AN, body.content, '21:47'),
            replyTo: { id: 'm2', author: TUAN, content: THEIRS.content, deleted: false }
        }))
        sessionStorage.clear()
    })

    it('says whom one answers above the composer, sends the reply with it, and quotes it in the list', async () => {
        const { container } = renderChat()
        await userEvent.click(within(await row(THEIRS.content)).getByRole('button', { name: 'Trả lời' }))

        const composer = screen.getByRole('textbox', { name: 'Nhắn #hoi-dap' })
        expect(composer).toHaveFocus()
        expect(screen.getByText('Đang trả lời')).toBeInTheDocument()
        expect(screen.getByText('Tuấn', { selector: 'strong' })).toBeInTheDocument()
        await expectNoA11yViolations(container)

        await userEvent.type(composer, 'Mình kẹt ở bước tìm miền D{Enter}')

        await waitFor(() => expect(messagesApi.sendMessage).toHaveBeenCalled())
        expect(messagesApi.sendMessage.mock.calls[0]![1]).toMatchObject({ replyToId: 'm2' })
        expect(screen.queryByText('Đang trả lời')).not.toBeInTheDocument()
        const reply = await row('Mình kẹt ở bước tìm miền D')
        expect(within(reply).getByText(THEIRS.content)).toBeInTheDocument()
    })

    it('stops replying on Esc or ✕', async () => {
        renderChat()
        await userEvent.click(within(await row(THEIRS.content)).getByRole('button', { name: 'Trả lời' }))
        await userEvent.keyboard('{Escape}')
        expect(screen.queryByText('Đang trả lời')).not.toBeInTheDocument()

        await userEvent.click(within(await row(THEIRS.content)).getByRole('button', { name: 'Trả lời' }))
        await userEvent.click(screen.getByRole('button', { name: 'Hủy trả lời' }))
        expect(screen.queryByText('Đang trả lời')).not.toBeInTheDocument()
    })

    it('says the original was deleted, in the reply bar and in the replies to it', async () => {
        messagesApi.fetchMessages.mockResolvedValue({
            items: [
                MINE,
                THEIRS,
                {
                    ...message('m3', AN, 'Đổi sang tọa độ cực', '21:46'),
                    replyTo: { id: 'm2', author: TUAN, content: THEIRS.content, deleted: false }
                }
            ],
            hasMoreBefore: false,
            hasMoreAfter: false
        })
        renderChat()
        const original = await screen.findByRole('article', { name: `Tuấn, 21:45: ${THEIRS.content}` })
        await userEvent.click(within(original).getByRole('button', { name: 'Trả lời' }))

        act(() => emitRealtimeEvent('message.deleted', { id: 'm2', channelId: 'hoi-dap' }))

        expect(await screen.findAllByText('Tin nhắn gốc đã bị xóa')).toHaveLength(2)
        await userEvent.type(screen.getByRole('textbox', { name: 'Nhắn #hoi-dap' }), 'Vẫn gửi{Enter}')
        await waitFor(() => expect(messagesApi.sendMessage.mock.calls[0]![1]).toMatchObject({ replyToId: 'm2' }))
    })

    it('reads a reply and an edited message with what they show', async () => {
        messagesApi.fetchMessages.mockResolvedValue({
            items: [
                { ...MINE, editedAt: at('20:12') },
                {
                    ...message('m3', TUAN, 'Mình giữ chỗ rồi', '21:46'),
                    replyTo: { id: 'm1', author: AN, content: MINE.content, deleted: false }
                }
            ],
            hasMoreBefore: false,
            hasMoreAfter: false
        })
        renderChat()

        expect(
            await screen.findByRole('article', { name: `An, 20:11: ${MINE.content} (đã chỉnh sửa)` })
        ).toBeInTheDocument()
        expect(screen.getByRole('article', { name: 'Tuấn, 21:46, trả lời An: Mình giữ chỗ rồi' })).toBeInTheDocument()
    })

    it('tells the composer whom one answers', async () => {
        renderChat()
        await userEvent.click(within(await row(THEIRS.content)).getByRole('button', { name: 'Trả lời' }))
        expect(screen.getByRole('textbox', { name: 'Nhắn #hoi-dap' })).toHaveAccessibleDescription('Đang trả lời Tuấn')
    })
})

describe('Moving through the messages by keyboard (S-CHAT-01 › Focus, C-10 › Accessibility)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        Object.values(messagesApi).forEach((fn) => fn.mockReset())
        messagesApi.fetchMessages.mockResolvedValue({
            items: [MINE, THEIRS],
            hasMoreBefore: false,
            hasMoreAfter: false
        })
        sessionStorage.clear()
    })

    it('reads each message as who, when and what; ↑ / ↓ go from one to the next', async () => {
        renderChat()
        const newest = await row(THEIRS.content)
        expect(newest).toHaveAccessibleName(`Tuấn, 21:45: ${THEIRS.content}`)
        expect(newest).toHaveAttribute('tabindex', '0')
        expect(await row(MINE.content)).toHaveAttribute('tabindex', '-1')

        newest.focus()
        await userEvent.keyboard('{ArrowUp}')
        expect(await row(MINE.content)).toHaveFocus()
        await userEvent.keyboard('{ArrowDown}')
        expect(newest).toHaveFocus()
    })
})
