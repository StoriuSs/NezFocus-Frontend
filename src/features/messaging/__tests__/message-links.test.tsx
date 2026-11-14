import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import { messageKeys } from '../api/keys'
import type { AppLink, ChannelMessages, ChatTarget, Message, MessageCursor, MessagePage } from '../types'

const messagesApi = {
    fetchMessages: vi.fn<(channelId: string, cursor: MessageCursor, limit?: number) => Promise<MessagePage>>(),
    sendMessage:
        vi.fn<(channelId: string, body: { content: string; nonce: string }, key: string) => Promise<Message>>(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn()
}
vi.mock('../api/messages.api', () => messagesApi)

const { default: ChannelChat } = await import('../components/ChannelChat')

const ZONE = 'Asia/Ho_Chi_Minh'
const person = (id: string, displayName: string) => ({ id, username: `${id}.tran`, displayName, avatarUrl: null })
const AN = person('an', 'An')
const CHI = person('chi', 'Chi')
const GIANG = person('giang', 'Giang')
const message = (id: string, author: typeof AN, content: string, extra: Partial<Message> = {}): Message => ({
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
    createdAt: new Date(Date.UTC(2026, 10, 13, 13, Number(id.slice(1)))).toISOString(),
    ...extra
})
const page = (items: Message[], more: { before?: boolean; after?: boolean } = {}): MessagePage => ({
    items,
    hasMoreBefore: more.before ?? false,
    hasMoreAfter: more.after ?? false
})

const ORIGIN = window.location.origin
const SOLUTION = message('m04', CHI, 'Đổi sang tọa độ cực rồi tính tích phân kép là ra nhé')
const LATEST = [
    message('m40', AN, 'Ok, mình vào sớm giữ chỗ'),
    message('m46', GIANG, `Lời giải câu 3 ở đây nè ${ORIGIN}/channels/ot/hoi-dap/m04`)
]

/** How links read here: the chip of #hoi-dap and of another server's #chung, "Can't view" for #rieng-tu. */
function readLink(href: string): AppLink | null {
    const url = new URL(href)
    if (url.origin !== ORIGIN) return null
    if (url.pathname.startsWith('/channels/ot/hoi-dap/'))
        return { kind: 'message', to: url.pathname, channel: 'hoi-dap' }
    if (url.pathname.startsWith('/channels/nd/chung/'))
        return { kind: 'message', to: url.pathname, server: 'Nhóm đồ án Mobile', channel: 'chung' }
    if (url.pathname.startsWith('/channels/ot/rieng-tu/')) return { kind: 'hidden' }
    return { kind: 'page', to: url.pathname }
}

function Where() {
    return <output data-testid='where'>{useLocation().pathname}</output>
}

function renderChat({ target, client = newClient() }: { target?: ChatTarget; client?: QueryClient } = {}) {
    client.setQueryData(userKeys.profile(), { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null })
    client.setQueryData(userKeys.settings(), { timezone: ZONE })
    const view = render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <MemoryRouter initialEntries={['/channels/ot/hoi-dap']}>
                    <Routes>
                        <Route
                            path='*'
                            element={
                                <div className='flex h-[600px] flex-col'>
                                    <ChannelChat
                                        channelId='hoi-dap'
                                        channelName='hoi-dap'
                                        permissions={{
                                            send: true,
                                            manage: false,
                                            deleteOwn: true,
                                            react: true,
                                            addReactions: true
                                        }}
                                        linkTo={(id) => `${ORIGIN}/channels/ot/hoi-dap/${id}`}
                                        readLink={readLink}
                                        target={target}
                                    />
                                    <Where />
                                </div>
                            }
                        />
                    </Routes>
                </MemoryRouter>
                <Toaster />
            </TooltipProvider>
        </QueryClientProvider>
    )
    return { ...view, client }
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
const row = async (text: string | RegExp) => (await screen.findByText(text)).closest('article') as HTMLElement
const lit = (article: HTMLElement) => article.dataset.highlight === 'true'
const cursors = () => messagesApi.fetchMessages.mock.calls.map(([, cursor]) => cursor)

describe('Formatting in a message (REQ-MSG-02, C-10)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        Object.values(messagesApi).forEach((fn) => fn.mockReset())
        sessionStorage.clear()
    })
    afterEach(() => vi.restoreAllMocks())

    it('draws bold, italic, code, a code block, a quote and links, and reads the text without the markers', async () => {
        const content =
            '**Tóm tắt câu 4:** đổi sang _tọa độ cực_, đặt `x = r cos φ`\n```\n= (π/2) · 4 = 2π\n```\n> Nhớ đổi cận\nhttps://tailieu.ptit.edu.vn/giai-tich-2'
        messagesApi.fetchMessages.mockResolvedValue(page([message('m41', CHI, content)]))
        const { container } = renderChat()

        const article = await row('Tóm tắt câu 4:')
        expect(within(article).getByText('Tóm tắt câu 4:').tagName).toBe('STRONG')
        expect(within(article).getByText('tọa độ cực').tagName).toBe('EM')
        expect(within(article).getByText('x = r cos φ').tagName).toBe('CODE')
        expect(within(article).getByText('= (π/2) · 4 = 2π').closest('pre')).not.toBeNull()
        expect(within(article).getByText('Nhớ đổi cận').closest('blockquote')).not.toBeNull()
        const link = within(article).getByRole('link', { name: 'https://tailieu.ptit.edu.vn/giai-tich-2' })
        expect(link).toHaveAttribute('href', 'https://tailieu.ptit.edu.vn/giai-tich-2')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        expect(article).toHaveAccessibleName(expect.stringContaining('Tóm tắt câu 4: đổi sang tọa độ cực'))
        expect(article.getAttribute('aria-label')).not.toContain('**')
        await expectNoA11yViolations(container)
    })

    it('never links javascript:, nor draws HTML', async () => {
        messagesApi.fetchMessages.mockResolvedValue(
            page([message('m41', CHI, 'javascript:alert(1) <img src=x onerror=alert(1)>')])
        )
        renderChat()

        const article = await row('javascript:alert(1) <img src=x onerror=alert(1)>')
        expect(within(article).queryByRole('link')).not.toBeInTheDocument()
        expect(article.querySelector('img')).toBeNull()
    })
})

describe('Message links (REQ-MSG-05, D-48)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        Object.values(messagesApi).forEach((fn) => fn.mockReset())
        sessionStorage.clear()
    })
    afterEach(() => vi.restoreAllMocks())

    it('shows a link to a message as a chip "#channel › Message", naming another server', async () => {
        messagesApi.fetchMessages.mockResolvedValue(
            page([...LATEST, message('m47', AN, `Bên đồ án cũng hỏi ${ORIGIN}/channels/nd/chung/m02`)])
        )
        renderChat()

        const here = await screen.findByRole('link', { name: '#hoi-dap › Tin nhắn' })
        expect(here).toHaveAttribute('href', '/channels/ot/hoi-dap/m04')
        expect(screen.getByRole('link', { name: 'Nhóm đồ án Mobile › #chung › Tin nhắn' })).toHaveAttribute(
            'href',
            '/channels/nd/chung/m02'
        )
        expect(screen.queryByText(`${ORIGIN}/channels/ot/hoi-dap/m04`, { exact: false })).not.toBeInTheDocument()
    })

    it('opens the message of a chip in the app', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page(LATEST))
        renderChat()

        await userEvent.click(await screen.findByRole('link', { name: '#hoi-dap › Tin nhắn' }))

        expect(screen.getByTestId('where')).toHaveTextContent('/channels/ot/hoi-dap/m04')
    })

    it('says "Can\'t view" for a message one cannot see, and stays on the page when it is clicked', async () => {
        messagesApi.fetchMessages.mockResolvedValue(
            page([message('m47', GIANG, `Bài cũ ${ORIGIN}/channels/ot/rieng-tu/m01`)])
        )
        renderChat()

        const chip = await screen.findByRole('button', { name: 'Không xem được' })
        expect(within(await row('Bài cũ')).queryByText(/rieng-tu/)).not.toBeInTheDocument()
        await userEvent.click(chip)

        expect(await screen.findByText('Bạn không xem được tin nhắn này')).toBeInTheDocument()
        expect(screen.getByTestId('where')).toHaveTextContent('/channels/ot/hoi-dap')
    })

    it('opens a channel at the message of a link: its history is read around it, and it lights up', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([message('m03', AN, 'Câu 3?'), SOLUTION], { after: true }))
        renderChat({ target: { messageId: 'm04', key: 'k1' } })

        await waitFor(() => expect(lit(screen.getByText(SOLUTION.content).closest('article')!)).toBe(true))
        expect(cursors()).toEqual([{ around: 'm04' }])
    })

    it('lights up a message the history already holds, without reading it again', async () => {
        const client = newClient()
        client.setQueryData<ChannelMessages>(messageKeys.channel('hoi-dap'), {
            pages: [page([SOLUTION, ...LATEST])],
            pageParams: [null]
        })
        renderChat({ client, target: { messageId: 'm04', key: 'k1' } })

        await waitFor(async () => expect(lit(await row(SOLUTION.content))).toBe(true))
        expect(messagesApi.fetchMessages).not.toHaveBeenCalled()
    })

    it('reads around a message the history does not hold yet', async () => {
        const client = newClient()
        client.setQueryData<ChannelMessages>(messageKeys.channel('hoi-dap'), {
            pages: [page(LATEST, { before: true })],
            pageParams: [null]
        })
        messagesApi.fetchMessages.mockResolvedValue(page([SOLUTION], { after: true }))
        renderChat({ client, target: { messageId: 'm04', key: 'k1' } })

        await waitFor(async () => expect(lit(await row(SOLUTION.content))).toBe(true))
        expect(cursors()).toEqual([{ around: 'm04' }])
        expect(screen.queryByText(LATEST[0]!.content)).not.toBeInTheDocument()
    })

    it('opens a deleted message\'s channel at its newest messages, saying "This message was deleted"', async () => {
        messagesApi.fetchMessages.mockImplementation(async (_, cursor) =>
            cursor ? page([message('m03', AN, 'Câu 3?')], { after: true }) : page(LATEST)
        )
        renderChat({ target: { messageId: 'm04', key: 'k1' } })

        expect(await screen.findByText('Tin nhắn này đã bị xóa')).toBeInTheDocument()
        expect(await screen.findByText(LATEST[0]!.content)).toBeInTheDocument()
        expect(cursors()).toEqual([{ around: 'm04' }, null])
    })

    it('goes to the original of a reply, and lights it up', async () => {
        const reply = message('m45', AN, 'Cảm ơn Chi, mình ra 8π/3 rồi', {
            replyTo: { id: 'm04', author: CHI, content: SOLUTION.content, deleted: false }
        })
        messagesApi.fetchMessages.mockImplementation(async (_, cursor) =>
            cursor ? page([SOLUTION], { after: true }) : page([...LATEST, reply], { before: true })
        )
        renderChat()

        const replying = await row('Cảm ơn Chi, mình ra 8π/3 rồi')
        await userEvent.click(within(replying).getByRole('button', { name: /Đổi sang tọa độ cực/ }))

        await waitFor(() => expect(lit(screen.getByText(SOLUTION.content).closest('article')!)).toBe(true))
        expect(cursors()).toEqual([null, { around: 'm04' }])
    })

    it('goes back to the newest messages from a history that stops short', async () => {
        messagesApi.fetchMessages.mockImplementation(async (_, cursor) =>
            cursor ? page([SOLUTION], { after: true }) : page(LATEST)
        )
        renderChat({ target: { messageId: 'm04', key: 'k1' } })
        await screen.findByText(SOLUTION.content)

        await userEvent.click(screen.getByRole('button', { name: 'Xuống tin mới nhất' }))

        expect(await screen.findByText(LATEST[0]!.content)).toBeInTheDocument()
        expect(screen.queryByText(SOLUTION.content)).not.toBeInTheDocument()
    })

    it('goes back to the newest messages before sending from a history that stops short', async () => {
        messagesApi.fetchMessages.mockImplementation(async (_, cursor) =>
            cursor ? page([SOLUTION], { after: true }) : page(LATEST)
        )
        messagesApi.sendMessage.mockImplementation(async (_, body) => ({
            ...message('m50', AN, body.content),
            nonce: body.nonce
        }))
        renderChat({ target: { messageId: 'm04', key: 'k1' } })
        await screen.findByText(SOLUTION.content)

        await userEvent.type(screen.getByRole('textbox'), 'Cảm ơn nha{Enter}')

        expect(await screen.findByText('Cảm ơn nha')).toBeInTheDocument()
        expect(screen.getByText(LATEST[0]!.content)).toBeInTheDocument()
        expect(cursors()).toEqual([{ around: 'm04' }, null])
        expect(screen.getByRole('textbox')).toHaveValue('')
    })

    it('keeps what was typed when the newest messages cannot be read, and sends nothing', async () => {
        messagesApi.fetchMessages.mockImplementation(async (_, cursor) => {
            if (cursor) return page([SOLUTION], { after: true })
            throw apiError(503, 'SERVICE_UNAVAILABLE')
        })
        renderChat({ target: { messageId: 'm04', key: 'k1' } })
        await screen.findByText(SOLUTION.content)

        await userEvent.type(screen.getByRole('textbox'), 'Cảm ơn nha{Enter}')

        await waitFor(() => expect(cursors()).toEqual([{ around: 'm04' }, null]))
        expect(screen.getByRole('textbox')).toHaveValue('Cảm ơn nha')
        expect(messagesApi.sendMessage).not.toHaveBeenCalled()
    })

    it('opens a channel left at an older message at its newest messages again (S-CHAT-01)', async () => {
        const client = newClient()
        client.setQueryData<ChannelMessages>(messageKeys.channel('hoi-dap'), {
            pages: [page([SOLUTION], { after: true })],
            pageParams: [{ around: 'm04' }]
        })
        messagesApi.fetchMessages.mockResolvedValue(page(LATEST))
        renderChat({ client })

        expect(await screen.findByText(LATEST[0]!.content)).toBeInTheDocument()
        expect(screen.queryByText(SOLUTION.content)).not.toBeInTheDocument()
        expect(cursors()).toEqual([null])
    })

    it('keeps the message being edited, not "deleted", when the list goes to another one', async () => {
        const mine = message('m44', AN, 'Mình làm ra 8π/3')
        const reply = message('m45', AN, 'Cảm ơn Chi', {
            replyTo: { id: 'm04', author: CHI, content: SOLUTION.content, deleted: false }
        })
        messagesApi.fetchMessages.mockImplementation(async (_, cursor) =>
            cursor ? page([SOLUTION], { after: true }) : page([...LATEST, mine, reply], { before: true })
        )
        renderChat()
        await userEvent.click(within(await row('Mình làm ra 8π/3')).getByRole('button', { name: 'Trả lời' }))
        expect(screen.getByText('Đang trả lời')).toBeInTheDocument()

        await userEvent.click(within(await row('Cảm ơn Chi')).getByRole('button', { name: /Đổi sang tọa độ cực/ }))
        await waitFor(() => expect(lit(screen.getByText(SOLUTION.content).closest('article')!)).toBe(true))

        expect(screen.queryByText('Tin nhắn này đã bị xóa')).not.toBeInTheDocument()
        expect(screen.queryByText('Tin nhắn gốc đã bị xóa')).not.toBeInTheDocument()
    })

    it('moves focus to the message gone to from the list', async () => {
        const reply = message('m45', AN, 'Cảm ơn Chi', {
            replyTo: { id: 'm04', author: CHI, content: SOLUTION.content, deleted: false }
        })
        messagesApi.fetchMessages.mockImplementation(async (_, cursor) =>
            cursor ? page([SOLUTION], { after: true }) : page([...LATEST, reply], { before: true })
        )
        renderChat()

        await userEvent.click(within(await row('Cảm ơn Chi')).getByRole('button', { name: /Đổi sang tọa độ cực/ }))

        await waitFor(() => expect(screen.getByText(SOLUTION.content).closest('article')).toHaveFocus())
    })

    it('keeps the message gone to when older messages read meanwhile come in', async () => {
        const reply = message('m45', AN, 'Cảm ơn Chi', {
            replyTo: { id: 'm04', author: CHI, content: SOLUTION.content, deleted: false }
        })
        let older: (value: MessagePage) => void = () => undefined
        messagesApi.fetchMessages.mockImplementation((_, cursor) => {
            if (cursor && 'before' in cursor) return new Promise((resolve) => (older = resolve))
            return Promise.resolve(
                cursor ? page([SOLUTION], { after: true }) : page([...LATEST, reply], { before: true })
            )
        })
        renderChat()
        await row('Cảm ơn Chi')
        fireEvent.scroll(screen.getByRole('log'))
        await waitFor(() => expect(cursors()).toContainEqual({ before: 'm40' }))

        await userEvent.click(within(await row('Cảm ơn Chi')).getByRole('button', { name: /Đổi sang tọa độ cực/ }))
        await waitFor(() => expect(lit(screen.getByText(SOLUTION.content).closest('article')!)).toBe(true))
        await act(async () => {
            older(page([message('m30', AN, 'Tin cũ')], { before: false, after: true }))
            // The query client tells its observers on the next turn.
            await new Promise((resolve) => setTimeout(resolve, 20))
        })

        expect(screen.getByText(SOLUTION.content)).toBeInTheDocument()
        expect(screen.queryByText('Tin cũ')).not.toBeInTheDocument()
    })
})
