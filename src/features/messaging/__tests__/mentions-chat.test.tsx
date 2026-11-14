import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { folded } from '@/lib/utils'
import { expectNoA11yViolations } from '@/test/a11y'
import type { ChatPermissions, Message, MessageCursor, MessagePage, MentionPerson, MentionSource } from '../types'

const messagesApi = {
    fetchMessages: vi.fn<(channelId: string, cursor: MessageCursor, limit?: number) => Promise<MessagePage>>(),
    sendMessage:
        vi.fn<(channelId: string, body: { content: string; nonce: string }, key: string) => Promise<Message>>(),
    editMessage: vi.fn<(messageId: string, content: string) => Promise<Message>>(),
    deleteMessage: vi.fn()
}
vi.mock('../api/messages.api', () => messagesApi)

const { default: ChannelChat } = await import('../components/ChannelChat')

const ZONE = 'Asia/Ho_Chi_Minh'
const AN = '0190a0b0-0000-7000-8000-00000000000a'
const BINH = '0190a0b0-0000-7000-8000-00000000000b'
const CHI = '0190a0b0-0000-7000-8000-00000000000c'
const MAI = '0190a0b0-0000-7000-8000-00000000000d'
const STRANGER = '0190a0b0-0000-7000-8000-00000000000e'
const LEADS = '0190a0b0-0000-7000-8000-0000000000f1'
const ADMINS = '0190a0b0-0000-7000-8000-0000000000f2'
const ELSEWHERE = '0190a0b0-0000-7000-8000-0000000000f3'
const HOI_DAP = '0190a0b0-0000-7000-8000-0000000000c1'
const TAI_LIEU = '0190a0b0-0000-7000-8000-0000000000c2'
const CHUNG = '0190a0b0-0000-7000-8000-0000000000c3'
const SECRET = '0190a0b0-0000-7000-8000-0000000000c4'

const person = (id: string, displayName: string, username: string) => ({ id, username, displayName, avatarUrl: null })
const an = person(AN, 'An', 'an.nguyen')
const binh = person(BINH, 'Bình', 'binh.tran')
const PEOPLE: MentionPerson[] = [an, binh, person(CHI, 'Chi', 'chi.le'), person(MAI, 'Mai', 'mai.tran')]

const message = (id: string, author: typeof an, content: string, extra: Partial<Message> = {}): Message => ({
    id,
    channelId: HOI_DAP,
    type: 'regular',
    author,
    content,
    mentionUsers: [],
    mentionRoles: [],
    mentionEveryone: false,
    systemEvent: null,
    systemData: null,
    systemUser: null,
    pinned: false,
    reactions: [],
    replyTo: null,
    editedAt: null,
    createdAt: new Date(Date.UTC(2026, 10, 14, 13, Number(id.slice(1)))).toISOString(),
    ...extra
})
const page = (items: Message[]): MessagePage => ({ items, hasMoreBefore: false, hasMoreAfter: false })

/** The servers feature's answer, as the channel page hands it: An holds "Trưởng nhóm". */
const SOURCE: MentionSource = {
    members: (query) => ({
        queryKey: ['test', 'members', query],
        queryFn: async () =>
            PEOPLE.filter((one) => folded(`${one.displayName} ${one.username}`).includes(folded(query)))
    }),
    roles: {
        queryKey: ['test', 'roles'],
        queryFn: async () => [
            { id: LEADS, name: 'Trưởng nhóm', memberCount: 2 },
            { id: ADMINS, name: 'Quản trị', memberCount: 1 }
        ]
    },
    channels: [
        { id: HOI_DAP, name: 'hoi-dap' },
        { id: TAI_LIEU, name: 'tai-lieu' }
    ],
    channel: (id) =>
        id === HOI_DAP
            ? { kind: 'channel', to: `/channels/ot/${HOI_DAP}`, name: 'hoi-dap' }
            : id === CHUNG
              ? { kind: 'channel', to: `/channels/nd/${CHUNG}`, name: 'chung', server: 'Nhóm đồ án Mobile' }
              : { kind: 'hidden' },
    roleIds: [LEADS]
}

const PERMISSIONS: ChatPermissions = {
    send: true,
    manage: false,
    deleteOwn: true,
    react: true,
    addReactions: true,
    mentionEveryone: false
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

function renderChat({
    permissions = PERMISSIONS,
    mentions = SOURCE
}: { permissions?: ChatPermissions; mentions?: MentionSource } = {}) {
    const client = newClient()
    client.setQueryData(userKeys.profile(), { id: AN, username: 'an.nguyen', displayName: 'An', avatarUrl: null })
    client.setQueryData(userKeys.settings(), { timezone: ZONE })
    const chat = (
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <MemoryRouter initialEntries={['/channels/ot/hoi-dap']}>
                    <div className='flex h-[600px] flex-col'>
                        <ChannelChat
                            channelId={HOI_DAP}
                            channelName='hoi-dap'
                            permissions={permissions}
                            linkTo={(id) => `/channels/ot/${HOI_DAP}/${id}`}
                            readLink={() => null}
                            mentions={mentions}
                        />
                    </div>
                </MemoryRouter>
                <Toaster />
            </TooltipProvider>
        </QueryClientProvider>
    )
    const view = render(chat)
    return { ...view, client, again: () => view.rerender(chat) }
}

const row = async (text: string | RegExp) => (await screen.findByText(text)).closest('article') as HTMLElement
const composer = () => screen.getByRole('combobox', { name: 'Nhắn #hoi-dap' })
const suggestions = () => screen.findByRole('listbox', { name: 'Gợi ý nhắc tới' })
const options = (list: HTMLElement) =>
    within(list)
        .getAllByRole('option')
        .map((option) => option.getAttribute('aria-label'))

beforeEach(async () => {
    await i18n.changeLanguage('vi')
    Object.values(messagesApi).forEach((fn) => fn.mockReset())
    sessionStorage.clear()
})
afterEach(() => vi.restoreAllMocks())

describe('Mentions in a message (REQ-MSG-03, C-10)', () => {
    it('draws people, roles and channels with the names the message carries; mentions of oneself apart', async () => {
        const content = `<@${BINH}> <@${AN}> <@&${LEADS}> <@&${ADMINS}> xem <#${HOI_DAP}> và <#${CHUNG}>`
        messagesApi.fetchMessages.mockResolvedValue(
            page([
                message('m10', binh, content, {
                    mentionUsers: [
                        { id: BINH, username: 'binh.tran', displayName: 'Bình' },
                        { id: AN, username: 'an.nguyen', displayName: 'An' }
                    ],
                    mentionRoles: [
                        { id: LEADS, name: 'Trưởng nhóm' },
                        { id: ADMINS, name: 'Quản trị' }
                    ]
                })
            ])
        )
        renderChat()

        const article = await row('@Bình')
        expect(within(article).getByText('@Bình')).toHaveClass('bg-surface-2', 'text-primary')
        // Oneself, and a role one holds: `surface-3` with `text-primary` words (C-10, DESIGN.md › Cặp bị cấm).
        expect(within(article).getByText('@An')).toHaveClass('bg-surface-3', 'text-text-primary')
        expect(within(article).getByText('@Trưởng nhóm')).toHaveClass('bg-surface-3')
        expect(within(article).getByText('@Quản trị')).toHaveClass('bg-surface-2')
        expect(within(article).getByRole('link', { name: '#hoi-dap' })).toHaveAttribute(
            'href',
            `/channels/ot/${HOI_DAP}`
        )
        expect(within(article).getByRole('link', { name: 'Nhóm đồ án Mobile › #chung' })).toHaveAttribute(
            'href',
            `/channels/nd/${CHUNG}`
        )
        expect(article).toHaveAccessibleName(
            /^Bình, .*20:10, nhắc tới bạn: @Bình @An @Trưởng nhóm @Quản trị xem #hoi-dap và #chung$/
        )
    })

    it('says a token that names no one is unknown, and a channel one cannot see is hidden', async () => {
        const content = `<@&${ELSEWHERE}> <@${STRANGER}> <@${CHI}> <#${SECRET}>`
        messagesApi.fetchMessages.mockResolvedValue(
            page([message('m11', binh, content, { mentionUsers: [{ id: CHI, username: null, displayName: null }] })])
        )
        renderChat()

        const article = await row('@vai trò không rõ')
        expect(within(article).getByText('@vai trò không rõ')).toHaveClass('text-text-secondary')
        expect(within(article).getByText('@người dùng không rõ')).toHaveClass('text-text-secondary')
        expect(within(article).getByText('@Tài khoản đã bị xóa')).toHaveClass('bg-surface-2')
        await expectNoA11yViolations(article)
        await userEvent.click(within(article).getByRole('button', { name: 'Không xem được' }))
        expect(await screen.findByText('Bạn không xem được kênh này')).toBeInTheDocument()
    })

    it('says a reply to a message deleted since is about the reader when it mentions them', async () => {
        messagesApi.fetchMessages.mockResolvedValue(
            page([
                message('m15', binh, `<@${AN}> ơi`, {
                    mentionUsers: [{ id: AN, username: 'an.nguyen', displayName: 'An' }],
                    replyTo: { id: 'm14', author: null, content: '', deleted: true, mentionUsers: [], mentionRoles: [] }
                })
            ])
        )
        renderChat()

        const article = await row('ơi')
        expect(article.dataset.related).toBe('true')
        expect(article).toHaveAccessibleName(/^Bình, .*, trả lời tin đã bị xóa, nhắc tới bạn: @An ơi$/)
    })

    it('draws @everyone as a mention only when it is one; otherwise it is words', async () => {
        messagesApi.fetchMessages.mockResolvedValue(
            page([
                message('m12', binh, '@everyone 22:30 chữa đề', { mentionEveryone: true }),
                message('m13', person(CHI, 'Chi', 'chi.le'), 'gõ @everyone cho vui')
            ])
        )
        renderChat()

        expect(within(await row('22:30 chữa đề')).getByText('@everyone')).toHaveClass('bg-surface-3')
        expect(within(await row(/cho vui/)).queryByText('@everyone')).toBeNull()
    })

    it('marks the messages about oneself, never one’s own (C-10 `related`, D-39, D-172)', async () => {
        const mine = message('m20', an, `tự nhắc <@${AN}>`, {
            mentionUsers: [{ id: AN, username: 'an.nguyen', displayName: 'An' }]
        })
        messagesApi.fetchMessages.mockResolvedValue(
            page([
                mine,
                message('m21', binh, 'Mình giữ chỗ cạnh An rồi nè', {
                    replyTo: {
                        id: 'm20',
                        author: an,
                        content: mine.content,
                        deleted: false,
                        mentionUsers: mine.mentionUsers,
                        mentionRoles: []
                    }
                }),
                message('m22', binh, '@everyone 22:30', { mentionEveryone: true }),
                message('m23', binh, 'Không liên quan')
            ])
        )
        renderChat()

        expect((await row('Mình giữ chỗ cạnh An rồi nè')).dataset.related).toBe('true')
        expect((await row('22:30')).dataset.related).toBe('true')
        expect((await row('tự nhắc')).dataset.related).toBeUndefined()
        expect((await row('Không liên quan')).dataset.related).toBeUndefined()
    })

    it('names the mentions of the message a reply answers in its line', async () => {
        const quoted = message('m30', binh, `<@${AN}> ơi xem <#${HOI_DAP}>`, {
            mentionUsers: [{ id: AN, username: 'an.nguyen', displayName: 'An' }]
        })
        messagesApi.fetchMessages.mockResolvedValue(
            page([
                quoted,
                message('m31', person(CHI, 'Chi', 'chi.le'), 'Ừ', {
                    replyTo: {
                        id: 'm30',
                        author: binh,
                        content: quoted.content,
                        deleted: false,
                        mentionUsers: quoted.mentionUsers,
                        mentionRoles: []
                    }
                })
            ])
        )
        renderChat()

        const reply = await row('Ừ')
        expect(within(reply).getByRole('button', { name: /@An ơi xem #hoi-dap/ })).toBeInTheDocument()
    })

    it('copies a message with names in place of its tokens (owner, 14/11/2026)', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        messagesApi.fetchMessages.mockResolvedValue(
            page([
                message('m40', binh, `**<@${AN}>** xem <#${HOI_DAP}>`, {
                    mentionUsers: [{ id: AN, username: 'an.nguyen', displayName: 'An' }]
                })
            ])
        )
        renderChat()

        await userEvent.click(within(await row(/xem/)).getByRole('button', { name: 'Thêm' }))
        await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Sao chép chữ' }))
        await waitFor(() => expect(writeText).toHaveBeenCalledWith('**@An** xem #hoi-dap'))
    })
})

describe('Suggestions after @ and # in the composer (C-12 › MentionSuggest)', () => {
    it('suggests people (not oneself) then roles whose name or username starts a word, the first chosen', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        renderChat()

        await userEvent.type(composer(), '@tr')
        const list = await suggestions()
        // "Quản trị" too: "tr" starts its second word (S-CHAT-01 `mention-suggest-role`).
        await waitFor(() =>
            expect(options(list)).toEqual([
                'Bình, binh.tran',
                'Mai, mai.tran',
                'Trưởng nhóm, 2 thành viên',
                'Quản trị, 1 thành viên'
            ])
        )
        expect(within(list).getByText('Thành viên')).toBeInTheDocument()
        expect(within(list).getByText('Vai trò')).toBeInTheDocument()
        expect(composer()).toHaveAttribute('aria-activedescendant', within(list).getAllByRole('option')[0]!.id)
        await expectNoA11yViolations(document.body)
    })

    it('puts the one picked with Enter in the text as its name, and sends its token', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        messagesApi.sendMessage.mockImplementation(() => new Promise(() => {}))
        renderChat()

        await userEvent.type(composer(), 'chào @bi')
        await waitFor(async () => expect(options(await suggestions())).toEqual(['Bình, binh.tran']))
        await userEvent.keyboard('{Enter}')
        expect(composer()).toHaveValue('chào @Bình ')
        expect(screen.queryByRole('listbox')).toBeNull()

        await userEvent.type(composer(), 'ơi{Enter}')
        await waitFor(() => expect(messagesApi.sendMessage).toHaveBeenCalled())
        expect(messagesApi.sendMessage.mock.calls[0]![1].content).toBe(`chào <@${BINH}> ơi`)
        // On its way, it already shows the mention by name.
        expect(within(await row(/chào/)).getByText('@Bình')).toHaveClass('bg-surface-2')
    })

    it('moves with ↓ / ↑, picks with Tab or a click, and closes on Esc with the text kept', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        renderChat()

        await userEvent.type(composer(), '@tr')
        await waitFor(async () => expect(options(await suggestions())).toHaveLength(4))
        await userEvent.keyboard('{ArrowDown}{ArrowDown}{Tab}')
        expect(composer()).toHaveValue('@Trưởng nhóm ')

        await userEvent.type(composer(), '@c')
        await userEvent.keyboard('{Escape}')
        expect(screen.queryByRole('listbox')).toBeNull()
        expect(composer()).toHaveValue('@Trưởng nhóm @c')

        // Closed for that word, as long as it is typed on; the next @ asks again.
        await userEvent.type(composer(), 'x')
        expect(screen.queryByRole('listbox')).toBeNull()
        await userEvent.type(composer(), ' @ch')
        await userEvent.click(within(await suggestions()).getByRole('option', { name: /Chi/ }))
        expect(composer()).toHaveValue('@Trưởng nhóm @cx @Chi ')
        expect(composer()).toHaveFocus()
    })

    it('puts the cursor after the space even when the box shows the same words (a name typed in full)', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        renderChat()

        await userEvent.type(composer(), '@Bình hi{ArrowLeft}{ArrowLeft}{ArrowLeft}')
        await waitFor(async () => expect(options(await suggestions())).toEqual(['Bình, binh.tran']))
        await userEvent.keyboard('{Enter}')
        expect(composer()).toHaveValue('@Bình hi')
        expect((composer() as HTMLTextAreaElement).selectionStart).toBe(6)
        await userEvent.keyboard('x')
        expect(composer()).toHaveValue('@Bình xhi')
    })

    it('stays open when the list itself is pressed, as on its scroll bar', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        renderChat()

        await userEvent.type(composer(), '@')
        const list = await suggestions()
        await userEvent.pointer({ keys: '[MouseLeft]', target: list })
        expect(composer()).toHaveFocus()
        expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    it('lets Esc stop a reply while the people are still being read, nothing shown yet', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([message('m60', binh, 'Câu 3 làm sao?')]))
        const waiting = () => new Promise<never>(() => {})
        const slow: MentionSource = {
            ...SOURCE,
            members: (query) => ({ queryKey: ['slow', 'members', query], queryFn: waiting }),
            roles: { queryKey: ['slow', 'roles'], queryFn: waiting }
        }
        renderChat({ mentions: slow })

        await userEvent.click(within(await row('Câu 3 làm sao?')).getByRole('button', { name: 'Trả lời' }))
        await userEvent.type(composer(), '@')
        expect(screen.queryByRole('listbox')).toBeNull()
        expect(composer()).toHaveAttribute('aria-expanded', 'false')
        expect(composer()).not.toHaveAttribute('aria-controls')
        await userEvent.keyboard('{Escape}')
        expect(screen.queryByText(/Đang trả lời/)).toBeNull()
    })

    it('suggests channels after #', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        renderChat()

        await userEvent.type(composer(), 'xem #ta')
        const list = await suggestions()
        expect(within(list).getByText('Kênh')).toBeInTheDocument()
        expect(options(list)).toEqual(['#tai-lieu'])
        await userEvent.keyboard('{Enter}')
        expect(composer()).toHaveValue('xem #tai-lieu ')
    })

    it('offers @everyone last, only with MENTION_EVERYONE', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        const first = renderChat()
        await userEvent.type(composer(), '@')
        await waitFor(async () => expect(options(await suggestions())).toHaveLength(5))
        expect(options(await suggestions()).join()).not.toMatch(/@everyone/)
        first.unmount()
        sessionStorage.clear()

        renderChat({ permissions: { ...PERMISSIONS, mentionEveryone: true } })
        await userEvent.type(composer(), '@ev')
        await waitFor(async () => expect(options(await suggestions()).at(-1)).toMatch(/^@everyone/))
    })

    it('says when nothing matches, and Enter still sends', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        messagesApi.sendMessage.mockImplementation(() => new Promise(() => {}))
        renderChat()

        await userEvent.type(composer(), '@zz')
        await suggestions()
        expect(await screen.findByText('Không có kết quả')).toBeInTheDocument()
        await expectNoA11yViolations(document.body)
        await userEvent.keyboard('{Enter}')
        await waitFor(() => expect(messagesApi.sendMessage.mock.calls[0]![1].content).toBe('@zz'))
    })

    it('keeps the names picked with the draft', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([]))
        const first = renderChat()
        await userEvent.type(composer(), '@bi')
        await waitFor(async () => expect(options(await suggestions())).toHaveLength(1))
        await userEvent.keyboard('{Enter}')
        first.unmount()

        renderChat()
        expect(composer()).toHaveValue('@Bình ')
    })
})

describe('Mentions while editing a message (C-10 `editing`)', () => {
    const MINE = message('m50', an, `<@${BINH}> xem <#${HOI_DAP}>`, {
        mentionUsers: [{ id: BINH, username: 'binh.tran', displayName: 'Bình' }]
    })
    const edit = async () => {
        await userEvent.click(within(await row(/xem/)).getByRole('button', { name: 'Thêm' }))
        await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: /Sửa/ }))
        return screen.getByRole('combobox', { name: 'Sửa tin nhắn' })
    }

    it('shows the names in the box, saves nothing when unchanged, and saves the tokens', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([MINE]))
        messagesApi.editMessage.mockImplementation(async (_id, content) => ({
            ...MINE,
            content,
            editedAt: MINE.createdAt
        }))
        renderChat()

        const box = await edit()
        expect(box).toHaveValue('@Bình xem #hoi-dap')
        await userEvent.keyboard('{Enter}')
        expect(messagesApi.editMessage).not.toHaveBeenCalled()

        const again = await edit()
        await userEvent.type(again, ' nhé @ch')
        await within(await suggestions()).findByRole('option', { name: /Chi/ })
        expect(again).toHaveAttribute('aria-expanded', 'true')
        await expectNoA11yViolations(document.body)
        await userEvent.click(within(await suggestions()).getByRole('option', { name: /Chi/ }))
        await userEvent.keyboard('{Enter}')
        await waitFor(() =>
            expect(messagesApi.editMessage).toHaveBeenCalledWith('m50', `<@${BINH}> xem <#${HOI_DAP}> nhé <@${CHI}>`)
        )
    })
})
