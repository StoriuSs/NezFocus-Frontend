import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import type { Attachment, MentionSource, Message, MessageCursor, MessagePage, UploadTicket } from '../types'

const NO_MENTIONS: MentionSource = {
    members: () => ({ queryKey: ['test', 'members'], queryFn: async () => [] }),
    roles: { queryKey: ['test', 'roles'], queryFn: async () => [] },
    channels: [],
    channel: () => ({ kind: 'hidden' }),
    roleIds: []
}

const messagesApi = {
    fetchMessages: vi.fn<(channelId: string, cursor: MessageCursor, limit?: number) => Promise<MessagePage>>(),
    sendMessage:
        vi.fn<
            (
                channelId: string,
                body: { content: string; nonce: string; attachmentIds?: string[] },
                key: string
            ) => Promise<Message>
        >(),
    editMessage: vi.fn<(messageId: string, content: string) => Promise<Message>>()
}
vi.mock('../api/messages.api', () => messagesApi)

const attachmentsApi = {
    requestUpload: vi.fn<(channelId: string, name: string, size: number) => Promise<UploadTicket>>(),
    completeUpload: vi.fn<(id: string) => Promise<Attachment>>(),
    fetchAttachmentLinks: vi.fn<(id: string) => Promise<Attachment>>()
}
vi.mock('../api/attachments.api', () => attachmentsApi)

/** Every upload reaches the storage at once, unless a test holds it. */
let hold = false
const held: Array<() => void> = []
vi.mock('../lib/upload-file', async (original) => ({
    ...(await original<typeof import('../lib/upload-file')>()),
    postFile: vi.fn(
        () =>
            new Promise<void>((resolve) => {
                if (hold) held.push(resolve)
                else resolve()
            })
    )
}))
const startDownload = vi.fn<(url: string) => void>()
vi.mock('../lib/download', () => ({ startDownload }))

const { default: ChannelChat } = await import('../components/ChannelChat')
const { useUploads } = await import('../attachment-tray.store')
const { removeUpload } = await import('../api/attachmentUploads')

const AN = { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null }
const file = (id: string, filename: string, change: Partial<Attachment> = {}): Attachment => ({
    id,
    filename,
    size: 1.8 * 1024 * 1024,
    contentType: 'application/pdf',
    width: null,
    height: null,
    url: `https://s3.test/${id}`,
    downloadUrl: `https://s3.test/${id}?download`,
    thumbnailUrl: null,
    ...change
})
const message = (id: string, content: string, change: Partial<Message> = {}): Message => ({
    attachments: [],
    id,
    channelId: 'hoi-dap',
    type: 'regular',
    author: AN,
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
    ...change
})

function renderChat({ attachFiles = true, history = [] as Message[] } = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(userKeys.profile(), AN)
    client.setQueryData(userKeys.settings(), { timezone: 'Asia/Ho_Chi_Minh' })
    messagesApi.fetchMessages.mockResolvedValue({ items: history, hasMoreBefore: false, hasMoreAfter: false })
    return render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <div className='flex h-[600px] flex-col'>
                    <ChannelChat
                        linkTo={(id) => `/channels/ot/hoi-dap/${id}`}
                        readLink={() => null}
                        mentions={NO_MENTIONS}
                        channelId='hoi-dap'
                        channelName='hoi-dap'
                        permissions={{
                            send: true,
                            sendBlocked: null,
                            manage: false,
                            deleteOwn: true,
                            react: true,
                            addReactions: true,
                            mentionEveryone: false,
                            attachFiles
                        }}
                    />
                </div>
            </TooltipProvider>
        </QueryClientProvider>
    )
}

const chooser = (container: HTMLElement) => container.querySelector<HTMLInputElement>('input[type=file]')!
const choose = (container: HTMLElement, files: File[]) => fireEvent.change(chooser(container), { target: { files } })
const bytes = (name: string, size = 10) => {
    const one = new File(['x'], name)
    Object.defineProperty(one, 'size', { value: size })
    return one
}

describe('Files in the composer (S-CHAT-04, C-41, D-93)', () => {
    let next = 0
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        next = 0
        hold = false
        held.length = 0
        sessionStorage.clear()
        messagesApi.sendMessage.mockReset()
        attachmentsApi.requestUpload.mockReset().mockImplementation(async () => {
            next += 1
            return {
                attachmentId: `a${next}`,
                upload: { url: 'https://s3.test', fields: [] },
                expiresAt: new Date().toISOString()
            }
        })
        attachmentsApi.completeUpload.mockReset().mockImplementation(async (id) => file(id, `${id}.pdf`))
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
        vi.spyOn(URL, 'revokeObjectURL').mockReturnValue()
    })
    afterEach(() => {
        for (const id of Object.keys(useUploads.getState().uploads)) removeUpload(id)
        vi.restoreAllMocks()
    })

    it('uploads the files chosen at once, and sends a message of files alone, in the order chosen', async () => {
        const user = userEvent.setup()
        const { container } = renderChat()
        await screen.findByText(/Đây là đầu kênh/)

        choose(container, [bytes('de-giua-ky.pdf'), bytes('bai-tap.docx')])

        expect(await screen.findByRole('list', { name: 'Tệp sẽ gửi' })).toBeInTheDocument()
        await waitFor(() => expect(useUploads.getState().trays['hoi-dap']!.length).toBe(2))
        await waitFor(() =>
            expect(Object.values(useUploads.getState().uploads).every((one) => one.state === 'done')).toBe(true)
        )
        // Said politely to screen readers (C-41).
        expect(screen.getByText(/^Đã tải lên (de-giua-ky\.pdf|bai-tap\.docx)$/)).toBeInTheDocument()
        messagesApi.sendMessage.mockImplementation(async (_c, body) => message('m1', body.content))

        await user.click(screen.getByLabelText('Nhắn #hoi-dap'))
        await user.keyboard('{Enter}')

        await waitFor(() => expect(messagesApi.sendMessage).toHaveBeenCalled())
        expect(messagesApi.sendMessage.mock.calls[0]![1]).toMatchObject({ content: '', attachmentIds: ['a1', 'a2'] })
        expect(screen.queryByRole('list', { name: 'Tệp sẽ gửi' })).not.toBeInTheDocument()
    })

    it('keeps out of the tray what may not go, saying why in one toast per reason', async () => {
        const error = vi.spyOn(toast, 'error')
        const { container } = renderChat()
        await screen.findByText(/Đây là đầu kênh/)

        choose(container, [bytes('virus.exe'), bytes('bai-giang.mp4', 26 * 1024 * 1024), bytes('rong.txt', 0)])

        expect(error).toHaveBeenCalledWith('Không gửi được tệp .exe')
        expect(error).toHaveBeenCalledWith('bai-giang.mp4 lớn hơn 25 MB nên không gửi được')
        expect(error).toHaveBeenCalledWith('rong.txt rỗng nên không gửi được')
        expect(screen.queryByRole('list', { name: 'Tệp sẽ gửi' })).not.toBeInTheDocument()
        expect(attachmentsApi.requestUpload).not.toHaveBeenCalled()
    })

    it('sends nothing while a file is in error, and says so, until it is taken out', async () => {
        const user = userEvent.setup()
        attachmentsApi.completeUpload.mockRejectedValueOnce(apiError(415, 'UPLOAD_INVALID_TYPE'))
        messagesApi.sendMessage.mockImplementation(async (_c, body) => message('m1', body.content))
        const { container } = renderChat()
        await screen.findByText(/Đây là đầu kênh/)

        choose(container, [bytes('cong-thuc.pdf')])
        expect(await screen.findByText('Không gửi được')).toBeInTheDocument()
        expect(screen.getByText('cong-thuc.pdf không phải tệp PDF thật nên không gửi được')).toBeInTheDocument()
        // Nothing is uploading any more: no "Đang tải lên" line (C-12).
        expect(screen.queryByText(/Đang tải lên/)).not.toBeInTheDocument()
        await user.click(screen.getByLabelText('Nhắn #hoi-dap'))
        await user.keyboard('Câu 4 đây{Enter}')

        const line = await screen.findByRole('alert')
        expect(line).toHaveTextContent('Gỡ hoặc thử lại tệp lỗi để gửi')
        // In place of "Đang tải lên x/y", under the tray, inside the composer (C-12).
        expect(screen.getByRole('list', { name: 'Tệp sẽ gửi' }).parentElement).toContainElement(line)
        expect(messagesApi.sendMessage).not.toHaveBeenCalled()

        await user.click(screen.getByRole('button', { name: 'Gỡ cong-thuc.pdf' }))
        // Said once, for that Enter: the next file in error shows no line until Enter again.
        attachmentsApi.completeUpload.mockRejectedValueOnce(apiError(415, 'UPLOAD_INVALID_TYPE'))
        choose(container, [bytes('sai-nua.pdf')])
        expect(await screen.findByText('Không gửi được')).toBeInTheDocument()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Gỡ sai-nua.pdf' }))
        await user.click(screen.getByLabelText('Nhắn #hoi-dap'))
        await user.keyboard('{Enter}')
        await waitFor(() => expect(messagesApi.sendMessage).toHaveBeenCalled())
        expect(messagesApi.sendMessage.mock.calls[0]![1]).toMatchObject({ content: 'Câu 4 đây' })
    })

    it('shows a message sent while its files upload as sending, with how many are up, then sends it', async () => {
        const user = userEvent.setup()
        hold = true
        messagesApi.sendMessage.mockImplementation(async (_c, body) => message('m1', body.content))
        const { container } = renderChat()
        await screen.findByText(/Đây là đầu kênh/)

        choose(container, [bytes('de-giua-ky.pdf')])
        await waitFor(() => expect(held).toHaveLength(1))
        await user.click(screen.getByLabelText('Nhắn #hoi-dap'))
        await user.keyboard('Đề nè{Enter}')

        expect(await screen.findByText('Đang tải lên 0/1')).toBeInTheDocument()
        expect(messagesApi.sendMessage).not.toHaveBeenCalled()
        held[0]!()
        await waitFor(() => expect(messagesApi.sendMessage).toHaveBeenCalled())
        expect(messagesApi.sendMessage.mock.calls[0]![1]).toMatchObject({ attachmentIds: ['a1'] })
    })

    it('fails a message whose file the backend no longer has; trying again uploads that file again', async () => {
        const user = userEvent.setup()
        messagesApi.sendMessage
            .mockRejectedValueOnce(apiError(404, 'UPLOAD_FILE_NOT_FOUND', { data: { attachmentIds: ['a1'] } }))
            .mockImplementation(async (_c, body) => message('m1', body.content))
        const { container } = renderChat()
        await screen.findByText(/Đây là đầu kênh/)
        choose(container, [bytes('cu.pdf')])
        await waitFor(() =>
            expect(Object.values(useUploads.getState().uploads).every((one) => one.state === 'done')).toBe(true)
        )
        await user.click(screen.getByLabelText('Nhắn #hoi-dap'))
        await user.keyboard('{Enter}')

        await user.click(await screen.findByRole('button', { name: 'Thử lại' }))

        await waitFor(() => expect(messagesApi.sendMessage).toHaveBeenCalledTimes(2))
        expect(attachmentsApi.requestUpload).toHaveBeenCalledTimes(2)
        expect(messagesApi.sendMessage.mock.calls[1]![1]).toMatchObject({ attachmentIds: ['a2'] })
    })

    it('moves along the tray with the arrows, takes a file out with Delete, and back to the box when the tray empties (C-41)', async () => {
        const user = userEvent.setup()
        const { container } = renderChat()
        await screen.findByText(/Đây là đầu kênh/)
        choose(container, [bytes('mot.pdf'), bytes('hai.pdf')])
        const tiles = await screen.findAllByRole('button', { name: /\.pdf, / })
        // One stop of the tab order: the first tile.
        expect(tiles.map((tile) => tile.tabIndex)).toEqual([0, -1])

        tiles[0]!.focus()
        await user.keyboard('{ArrowRight}')
        expect(screen.getByRole('button', { name: /^hai\.pdf, / })).toHaveFocus()
        await user.keyboard('{Delete}')
        await waitFor(() => expect(screen.getByRole('button', { name: /^mot\.pdf, / })).toHaveFocus())
        await user.keyboard('{Backspace}')

        await waitFor(() => expect(screen.getByLabelText('Nhắn #hoi-dap')).toHaveFocus())
        expect(screen.queryByRole('list', { name: 'Tệp sẽ gửi' })).not.toBeInTheDocument()
    })

    it('pastes the text of a copy that also holds a picture (Word, Excel) as text', async () => {
        renderChat()
        const box = await screen.findByLabelText('Nhắn #hoi-dap')

        const event = new Event('paste', { bubbles: true, cancelable: true })
        Object.assign(event, {
            clipboardData: {
                files: [bytes('bang.png')],
                getData: (type: string) => (type === 'text/plain' ? 'Bảng điểm' : '')
            }
        })
        box.dispatchEvent(event)

        expect(event.defaultPrevented).toBe(false)
        expect(attachmentsApi.requestUpload).not.toHaveBeenCalled()
    })

    it('shows the file a message failed on, and keeps a message of files alone that has nothing left to send', async () => {
        const user = userEvent.setup()
        attachmentsApi.completeUpload.mockRejectedValueOnce(apiError(415, 'UPLOAD_INVALID_TYPE'))
        hold = true
        const { container } = renderChat()
        await screen.findByText(/Đây là đầu kênh/)
        choose(container, [bytes('cong-thuc.pdf')])
        await waitFor(() => expect(held).toHaveLength(1))
        await user.click(screen.getByLabelText('Nhắn #hoi-dap'))
        await user.keyboard('{Enter}')
        held[0]!()

        const row = await screen.findByRole('article', { name: /An/ })
        await waitFor(() => expect(within(row).getByText('Không gửi được', { selector: 'span' })).toBeInTheDocument())
        await user.click(within(row).getByRole('button', { name: 'Thử lại' }))

        // Nothing it could still send: the message stays, failed, for "Bỏ".
        expect(await screen.findByRole('article', { name: /An/ })).toBeInTheDocument()
        expect(messagesApi.sendMessage).not.toHaveBeenCalled()

        // "Bỏ" lets its files go too.
        await user.click(within(await screen.findByRole('article', { name: /An/ })).getByRole('button', { name: 'Bỏ' }))
        await waitFor(() => expect(Object.keys(useUploads.getState().uploads)).toEqual([]))
    })

    it('marks a file the channel no longer takes as not sendable, not to try again', async () => {
        attachmentsApi.requestUpload.mockRejectedValueOnce(apiError(403, 'FORBIDDEN_ERROR'))
        const { container } = renderChat()
        await screen.findByText(/Đây là đầu kênh/)

        choose(container, [bytes('bi-cam.pdf')])

        expect(await screen.findByRole('button', { name: 'bi-cam.pdf, Không gửi được' })).toBeInTheDocument()
        expect(screen.getByText('Bạn không gửi được tệp trong kênh này')).toBeInTheDocument()
    })

    it('offers no (+) without ATTACH_FILES, and keeps pasted files out, saying why', async () => {
        const error = vi.spyOn(toast, 'error')
        renderChat({ attachFiles: false })
        const box = await screen.findByLabelText('Nhắn #hoi-dap')

        expect(screen.queryByRole('button', { name: 'Đính kèm tệp' })).not.toBeInTheDocument()
        fireEvent.paste(box, { clipboardData: { files: [bytes('anh.png')], getData: () => '' } })

        expect(error).toHaveBeenCalledWith('Bạn không gửi được tệp trong kênh này')
        expect(attachmentsApi.requestUpload).not.toHaveBeenCalled()
    })

    it('has a tray readable by everyone (C-41)', async () => {
        const { container } = renderChat()
        await screen.findByText(/Đây là đầu kênh/)
        choose(container, [bytes('de-giua-ky.pdf'), bytes('anh.png')])
        await screen.findByRole('list', { name: 'Tệp sẽ gửi' })

        await expectNoA11yViolations(container)
    })
})

describe('Files in a message (C-10 › Tệp trong tin, REQ-MSG-04)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        sessionStorage.clear()
        attachmentsApi.fetchAttachmentLinks.mockReset()
        startDownload.mockReset()
    })
    afterEach(() => vi.restoreAllMocks())

    it('shows images first, then the other files as cards; a download asks for new links first', async () => {
        const user = userEvent.setup()
        attachmentsApi.fetchAttachmentLinks.mockResolvedValue(
            file('f2', 'de-giua-ky.pdf', { downloadUrl: 'https://s3.test/new' })
        )
        renderChat({
            history: [
                message('m1', '', {
                    attachments: [
                        file('f2', 'de-giua-ky.pdf'),
                        file('f1', 'cau4.jpg', {
                            contentType: 'image/jpeg',
                            width: 1600,
                            height: 900,
                            thumbnailUrl: 'https://s3.test/t1'
                        })
                    ]
                })
            ]
        })

        const image = await screen.findByRole('img', { name: 'Ảnh cau4.jpg' })
        // One image: its own shape within 360 × 320.
        expect(image).toHaveStyle({ width: '360px', height: '203px' })
        expect(screen.getByText('1,8 MB')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Tải về de-giua-ky.pdf' }))

        await waitFor(() => expect(startDownload).toHaveBeenCalledWith('https://s3.test/new'))
        expect(attachmentsApi.fetchAttachmentLinks).toHaveBeenCalledWith('f2')
    })

    it('stays in the app when new links cannot be had for a download, and says so', async () => {
        const user = userEvent.setup()
        const error = vi.spyOn(toast, 'error')
        attachmentsApi.fetchAttachmentLinks.mockRejectedValue(apiError(404, 'UPLOAD_FILE_NOT_FOUND'))
        renderChat({ history: [message('m1', '', { attachments: [file('f2', 'de-giua-ky.pdf')] })] })

        await user.click(await screen.findByRole('button', { name: 'Tải về de-giua-ky.pdf' }))

        await waitFor(() => expect(error).toHaveBeenCalled())
        expect(startDownload).not.toHaveBeenCalled()
    })

    it('saves all the text taken out of a message with files, without asking to delete it (S-CHAT-01 edit-mode)', async () => {
        const user = userEvent.setup()
        messagesApi.editMessage.mockImplementation(async (id, content) =>
            message(id, content, { attachments: [file('f2', 'de-giua-ky.pdf')] })
        )
        renderChat({ history: [message('m1', 'Đề nè', { attachments: [file('f2', 'de-giua-ky.pdf')] })] })
        const box = await screen.findByLabelText('Nhắn #hoi-dap')

        await user.click(box)
        await user.keyboard('{ArrowUp}')
        const editor = await screen.findByLabelText('Sửa tin nhắn')
        await user.clear(editor)
        await user.keyboard('{Enter}')

        await waitFor(() => expect(messagesApi.editMessage).toHaveBeenCalledWith('m1', ''))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('says what was sent on the reply line of a message of files alone', async () => {
        renderChat({
            history: [
                message('m2', 'Đẹp!', {
                    replyTo: {
                        id: 'm1',
                        author: AN,
                        content: '',
                        deleted: false,
                        mentionUsers: [],
                        mentionRoles: [],
                        files: { count: 1, images: 1 }
                    }
                })
            ]
        })

        expect(await screen.findByText('Đã gửi một ảnh')).toBeInTheDocument()
    })
})
