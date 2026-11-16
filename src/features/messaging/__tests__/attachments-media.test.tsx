import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { emitRealtimeEvent } from '@/features/realtime/lib/realtime-events'
import { userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import type {
    Attachment,
    ChannelMessages,
    ChatPermissions,
    MentionSource,
    Message,
    MessageCursor,
    MessagePage,
    UploadTicket
} from '../types'

const NO_MENTIONS: MentionSource = {
    members: () => ({ queryKey: ['test', 'members'], queryFn: async () => [] }),
    roles: { queryKey: ['test', 'roles'], queryFn: async () => [] },
    channels: [],
    channel: () => ({ kind: 'hidden' }),
    roleIds: []
}

const messagesApi = {
    fetchMessages: vi.fn<(channelId: string, cursor: MessageCursor, limit?: number) => Promise<MessagePage>>(),
    sendMessage: vi.fn(),
    editMessage: vi.fn()
}
vi.mock('../api/messages.api', () => messagesApi)

const attachmentsApi = {
    requestUpload: vi.fn<(channelId: string, name: string, size: number) => Promise<UploadTicket>>(),
    completeUpload: vi.fn<(id: string) => Promise<Attachment>>(),
    fetchAttachmentLinks: vi.fn<(id: string) => Promise<Attachment>>()
}
vi.mock('../api/attachments.api', () => attachmentsApi)

const posted: Array<() => void> = []
vi.mock('../lib/upload-file', async (original) => ({
    ...(await original<typeof import('../lib/upload-file')>()),
    postFile: vi.fn(() => new Promise<void>((resolve) => posted.push(resolve)))
}))
const download = { startDownload: vi.fn<(url: string) => void>(), openInNewTab: vi.fn<(url: string) => void>() }
vi.mock('../lib/download', () => download)

const { default: ChannelChat, ChatDropZone } = await import('../components/ChannelChat')
const { useUploads } = await import('../attachment-tray.store')
const { removeUpload } = await import('../api/attachmentUploads')
const { fitted } = await import('../components/attachments/MessageAttachments')
const { messageKeys } = await import('../api/keys')

let chatClient: QueryClient

const AN = { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null }
const image = (id: string, filename: string, change: Partial<Attachment> = {}): Attachment => ({
    id,
    filename,
    size: 1.9 * 1024 * 1024,
    contentType: 'image/jpeg',
    width: 1200,
    height: 900,
    url: `https://s3.test/${id}`,
    downloadUrl: `https://s3.test/${id}?download`,
    thumbnailUrl: `https://s3.test/${id}?thumb`,
    ...change
})
const other = (id: string, filename: string, contentType: string, size = 3.2 * 1024 * 1024): Attachment =>
    image(id, filename, { contentType, size, width: null, height: null, thumbnailUrl: null })
const message = (id: string, attachments: Attachment[], content = ''): Message => ({
    attachments,
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
    pinned: false,
    reactions: [],
    replyTo: null,
    editedAt: null,
    createdAt: new Date().toISOString()
})

const THREE = [image('i1', 'cau4-1.jpg'), image('i2', 'cau4-2.jpg'), image('i3', 'cau4-3.jpg')]
const PDF = other('p1', 'de-giua-ky-2025.pdf', 'application/pdf', 1.8 * 1024 * 1024)

function renderChat(history: Message[]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    chatClient = client
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
                            attachFiles: true
                        }}
                    />
                </div>
                <Toaster />
            </TooltipProvider>
        </QueryClientProvider>
    )
}

const pdfViewer = (enabled: boolean) =>
    Object.defineProperty(navigator, 'pdfViewerEnabled', { value: enabled, configurable: true })

describe('Files in messages: viewer, players (S-CHAT-04, C-10, C-42)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        attachmentsApi.fetchAttachmentLinks.mockReset()
        download.startDownload.mockReset()
        download.openInNewTab.mockReset()
        pdfViewer(true)
    })
    afterEach(() => vi.restoreAllMocks())

    it('shows the images first, then videos, then sounds, then the cards, each in the order sent', async () => {
        const video = other('v1', 'chua-de-17-10.mp4', 'video/mp4', 18.4 * 1024 * 1024)
        const sound = other('s1', 'ghi-am-cau-5.m4a', 'audio/mp4')
        renderChat([message('m1', [PDF, sound, video, THREE[0]!], 'Bản ghi buổi chữa đề')])

        const row = await screen.findByText('Bản ghi buổi chữa đề')
        const order = [
            ...row.closest('article')!.querySelectorAll('img[alt^="Ảnh"], video, audio, button[aria-label^="Xem"]')
        ]
        expect(order.map((node) => node.tagName)).toEqual(['IMG', 'VIDEO', 'AUDIO', 'BUTTON'])
        expect(screen.getByLabelText('Video chua-de-17-10.mp4')).toHaveAttribute('src', 'https://s3.test/v1')
        expect(screen.getByText('chua-de-17-10.mp4 · 18,4 MB')).toBeInTheDocument()
        expect(screen.getByLabelText('Âm thanh ghi-am-cau-5.m4a')).toHaveAttribute('controls')
    })

    it('says a video the browser cannot play, after asking once for new links, and still downloads it', async () => {
        const user = userEvent.setup()
        const video = other('v1', 'hevc.mp4', 'video/mp4')
        attachmentsApi.fetchAttachmentLinks.mockResolvedValue({ ...video, url: 'https://s3.test/v1-new' })
        renderChat([message('m1', [video])])

        fireEvent.error(await screen.findByLabelText('Video hevc.mp4'))
        await waitFor(() =>
            expect(screen.getByLabelText('Video hevc.mp4')).toHaveAttribute('src', 'https://s3.test/v1-new')
        )
        fireEvent.error(screen.getByLabelText('Video hevc.mp4'))

        expect(await screen.findByText('Trình duyệt không phát được video này')).toBeInTheDocument()
        expect(screen.getByText('hevc.mp4 · 3,2 MB')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Tải về' }))
        await waitFor(() => expect(download.startDownload).toHaveBeenCalledWith('https://s3.test/v1?download'))
    })

    it('keeps a very flat image 80 high, cut in the middle, but never makes a small one bigger', () => {
        expect(fitted({ width: 4000, height: 500 })).toEqual({ width: 360, height: 80 })
        expect(fitted({ width: 1200, height: 900 })).toEqual({ width: 360, height: 270 })
        expect(fitted({ width: 100, height: 20 })).toEqual({ width: 100, height: 20 })
    })

    it('opens an image in the viewer: who and when, "2 / 3", ← / → and ‹ ›, Esc back to the image', async () => {
        const user = userEvent.setup()
        renderChat([message('m1', THREE)])
        const second = (await screen.findByAltText('Ảnh cau4-2.jpg')).closest('button')!

        await user.click(second)

        const viewer = await screen.findByRole('dialog', { name: 'Ảnh cau4-2.jpg của An' })
        expect(within(viewer).getByText('2 / 3')).toBeInTheDocument()
        expect(within(viewer).getByText(/^· Hôm nay \d\d:\d\d · cau4-2\.jpg · 1,9 MB$/)).toBeInTheDocument()
        expect(within(viewer).getByRole('img', { name: 'Ảnh cau4-2.jpg' })).toHaveAttribute('src', 'https://s3.test/i2')
        await expectNoA11yViolations(viewer)

        await user.keyboard('{ArrowRight}')
        expect(within(viewer).getByText('3 / 3')).toBeInTheDocument()
        expect(within(viewer).getByRole('button', { name: 'Ảnh sau' })).toBeDisabled()
        await user.click(within(viewer).getByRole('button', { name: 'Ảnh trước' }))
        await user.click(within(viewer).getByRole('button', { name: 'Ảnh trước' }))
        expect(within(viewer).getByText('1 / 3')).toBeInTheDocument()
        expect(within(viewer).getByRole('button', { name: 'Ảnh trước' })).toBeDisabled()

        // The focus moved to ›, whose Tooltip Esc closes first; the second closes the viewer.
        await user.keyboard('{Escape}{Escape}')
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(second).toHaveFocus()
    })

    it('downloads and opens in a new tab from the viewer, with new links each time', async () => {
        const user = userEvent.setup()
        attachmentsApi.fetchAttachmentLinks.mockResolvedValue({
            ...THREE[0]!,
            url: 'https://s3.test/i1-new',
            downloadUrl: 'https://s3.test/i1-new?download'
        })
        renderChat([message('m1', [THREE[0]!])])
        await user.click((await screen.findByAltText('Ảnh cau4-1.jpg')).closest('button')!)
        const viewer = await screen.findByRole('dialog', { name: 'Ảnh cau4-1.jpg của An' })
        // One image: no ‹ ›, no count.
        expect(within(viewer).queryByRole('button', { name: 'Ảnh sau' })).not.toBeInTheDocument()
        expect(within(viewer).queryByText('1 / 1')).not.toBeInTheDocument()

        await user.click(within(viewer).getByRole('button', { name: 'Tải về' }))
        await user.click(within(viewer).getByRole('button', { name: 'Mở tab mới' }))

        await waitFor(() => expect(download.openInNewTab).toHaveBeenCalledWith('https://s3.test/i1-new'))
        expect(download.startDownload).toHaveBeenCalledWith('https://s3.test/i1-new?download')
    })

    it('opens a PDF card in the browser viewer, from new links', async () => {
        const user = userEvent.setup()
        attachmentsApi.fetchAttachmentLinks.mockResolvedValue({ ...PDF, url: 'https://s3.test/p1-new' })
        renderChat([message('m1', [PDF])])

        await user.click(await screen.findByRole('button', { name: 'Xem de-giua-ky-2025.pdf' }))

        const viewer = await screen.findByRole('dialog', { name: 'Tệp de-giua-ky-2025.pdf của An' })
        await waitFor(() => expect(viewer.querySelector('iframe')).toHaveAttribute('src', 'https://s3.test/p1-new'))
        expect(within(viewer).queryByText(/\d \/ \d/)).not.toBeInTheDocument()
        await user.click(within(viewer).getByRole('button', { name: 'Đóng' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(screen.getByRole('button', { name: 'Xem de-giua-ky-2025.pdf' })).toHaveFocus()
    })

    it('keeps the PDF where it was read when its links are asked for again ("Tải về")', async () => {
        const user = userEvent.setup()
        let made = 0
        attachmentsApi.fetchAttachmentLinks.mockImplementation(async () => ({
            ...PDF,
            url: `https://s3.test/p1-${++made}`
        }))
        renderChat([message('m1', [PDF])])
        await user.click(await screen.findByRole('button', { name: 'Xem de-giua-ky-2025.pdf' }))
        const viewer = await screen.findByRole('dialog')
        await waitFor(() => expect(viewer.querySelector('iframe')).toHaveAttribute('src', 'https://s3.test/p1-1'))

        await user.click(within(viewer).getByRole('button', { name: 'Tải về' }))

        await waitFor(() => expect(download.startDownload).toHaveBeenCalled())
        expect(viewer.querySelector('iframe')).toHaveAttribute('src', 'https://s3.test/p1-1')
    })

    it('moves the focus to ‹ when › reaches the last image, so ← / → still work', async () => {
        const user = userEvent.setup()
        renderChat([message('m1', THREE)])
        await user.click((await screen.findByAltText('Ảnh cau4-2.jpg')).closest('button')!)
        const viewer = await screen.findByRole('dialog')

        await user.click(within(viewer).getByRole('button', { name: 'Ảnh sau' }))

        expect(within(viewer).getByText('3 / 3')).toBeInTheDocument()
        expect(within(viewer).getByRole('button', { name: 'Ảnh trước' })).toHaveFocus()
        await user.keyboard('{ArrowLeft}')
        expect(within(viewer).getByText('2 / 3')).toBeInTheDocument()
    })

    it('closes the viewer without a word when its message is only out of the history held (started over)', async () => {
        const user = userEvent.setup()
        renderChat([message('m1', THREE)])
        await user.click((await screen.findByAltText('Ảnh cau4-1.jpg')).closest('button')!)
        await screen.findByRole('dialog')

        act(
            () =>
                void chatClient.setQueryData<ChannelMessages>(messageKeys.channel('hoi-dap'), {
                    pages: [{ items: [message('m9', [])], hasMoreBefore: true, hasMoreAfter: false }],
                    pageParams: [null]
                })
        )

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(screen.queryByText('Tin nhắn này đã bị xóa')).not.toBeInTheDocument()

        // Scrolled back to it later: nobody opened it, so it stays closed.
        act(
            () =>
                void chatClient.setQueryData<ChannelMessages>(messageKeys.channel('hoi-dap'), {
                    pages: [{ items: [message('m1', THREE)], hasMoreBefore: false, hasMoreAfter: false }],
                    pageParams: [null]
                })
        )
        await screen.findByAltText('Ảnh cau4-1.jpg')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('says so when the browser shows no PDF, with "Tải về"', async () => {
        const user = userEvent.setup()
        pdfViewer(false)
        attachmentsApi.fetchAttachmentLinks.mockResolvedValue(PDF)
        renderChat([message('m1', [PDF])])

        await user.click(await screen.findByRole('button', { name: 'Xem de-giua-ky-2025.pdf' }))

        const viewer = await screen.findByRole('dialog')
        expect(within(viewer).getByText('Trình duyệt không xem được tệp này')).toBeInTheDocument()
        expect(viewer.querySelector('iframe')).toBeNull()
        await user.click(within(viewer).getAllByRole('button', { name: 'Tải về' }).at(-1)!)
        await waitFor(() => expect(download.startDownload).toHaveBeenCalled())
    })

    it('closes the viewer with a Toast when its message is deleted meanwhile', async () => {
        const user = userEvent.setup()
        renderChat([message('m1', THREE)])
        await user.click((await screen.findByAltText('Ảnh cau4-1.jpg')).closest('button')!)
        await screen.findByRole('dialog')

        act(() => emitRealtimeEvent('message.deleted', { id: 'm1', channelId: 'hoi-dap' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(await screen.findByText('Tin nhắn này đã bị xóa')).toBeInTheDocument()
    })
})

/** A drag of files, as the browser sends it: `Files` among its types. */
function drag(target: Element, type: 'dragEnter' | 'dragOver' | 'dragLeave' | 'drop', files: File[] = []) {
    const event = createEvent[type](target, { dataTransfer: { types: ['Files'], files, dropEffect: 'none' } })
    fireEvent(target, event)
    return event
}

const OPEN: Pick<ChatPermissions, 'attachFiles' | 'sendBlocked'> = { attachFiles: true, sendBlocked: null }

describe('Files dragged onto the page (C-12 drop-target, drop-blocked)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        posted.length = 0
        attachmentsApi.requestUpload.mockReset().mockImplementation(async () => ({
            attachmentId: 'a1',
            upload: { url: 'https://s3.test', fields: [] },
            expiresAt: new Date().toISOString()
        }))
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
        vi.spyOn(URL, 'revokeObjectURL').mockReturnValue()
    })
    afterEach(() => {
        for (const id of Object.keys(useUploads.getState().uploads)) removeUpload(id)
        vi.restoreAllMocks()
    })

    function renderZone(permissions: Pick<ChatPermissions, 'attachFiles' | 'sendBlocked'> = OPEN) {
        const client = new QueryClient()
        client.setQueryData(userKeys.settings(), { timezone: 'Asia/Ho_Chi_Minh' })
        return render(
            <QueryClientProvider client={client}>
                <section data-testid='column'>
                    <p>Tin nhắn</p>
                    <ChatDropZone channelId='hoi-dap' channelName='hoi-dap' permissions={permissions} />
                </section>
                <aside data-testid='panel'>Thành viên</aside>
            </QueryClientProvider>
        )
    }

    it('covers the column while files are dragged over it, and puts the dropped ones in the tray', async () => {
        renderZone()
        const column = screen.getByTestId('column')
        const inside = screen.getByText('Tin nhắn')

        drag(column, 'dragEnter')
        drag(inside, 'dragEnter')
        drag(column, 'dragLeave')
        expect(screen.getByText('Thả tệp để gửi vào #hoi-dap')).toBeVisible()
        expect(screen.getByText('Tối đa 10 tệp, mỗi tệp 25 MB')).toBeVisible()
        expect(drag(inside, 'dragOver').defaultPrevented).toBe(true)

        drag(inside, 'drop', [new File(['x'], 'cau4-1.jpg'), new File(['x'], 'setup.exe')])

        expect(screen.getByTestId('drop-zone')).not.toBeVisible()
        expect(useUploads.getState().trays['hoi-dap']).toHaveLength(1)
        expect(Object.values(useUploads.getState().uploads)[0]!.file.name).toBe('cau4-1.jpg')
    })

    it('leaves once the drag leaves the column, and ignores what carries no file', () => {
        renderZone()
        const column = screen.getByTestId('column')

        fireEvent(column, createEvent.dragEnter(column, { dataTransfer: { types: ['text/plain'] } }))
        expect(screen.getByTestId('drop-zone')).not.toBeVisible()

        drag(column, 'dragEnter')
        drag(column, 'dragLeave')
        expect(screen.getByTestId('drop-zone')).not.toBeVisible()
    })

    it('says why without a frame for one who may not send files here, and a drop does nothing', () => {
        renderZone({ sendBlocked: null, attachFiles: false })
        const column = screen.getByTestId('column')

        drag(column, 'dragEnter')
        expect(screen.getByText('Bạn không gửi được tệp trong kênh này')).toBeVisible()
        expect(screen.queryByText('Thả tệp để gửi vào #hoi-dap')).not.toBeInTheDocument()
        drag(column, 'drop', [new File(['x'], 'cau4-1.jpg')])

        expect(useUploads.getState().trays['hoi-dap'] ?? []).toHaveLength(0)
    })

    it('says one may not send at all when that is why', () => {
        renderZone({ sendBlocked: { reason: 'no-permission' }, attachFiles: false })
        drag(screen.getByTestId('column'), 'dragEnter')
        expect(screen.getByText('Bạn chưa có quyền gửi tin trong server này')).toBeVisible()
    })

    it('says only moderators post in a channel that is theirs (02 managers-only)', () => {
        renderZone({ sendBlocked: { reason: 'managers-only' }, attachFiles: false })
        drag(screen.getByTestId('column'), 'dragEnter')
        expect(screen.getByText('Chỉ người quản lý được gửi tin trong kênh này')).toBeVisible()
    })

    it('says until when one is timed out, files and all (02 drop-blocked)', () => {
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
        const until = new Date(`${day}T22:30:00+07:00`).toISOString()
        renderZone({ sendBlocked: { reason: 'timed-out', until }, attachFiles: false })
        drag(screen.getByTestId('column'), 'dragEnter')
        expect(screen.getByText('Bạn đang bị tạm khóa tới 22:30')).toBeVisible()
        expect(screen.getByText('Chưa gửi tin được, kể cả tệp')).toBeVisible()
        drag(screen.getByTestId('column'), 'drop', [new File(['x'], 'cau4-1.jpg')])
        expect(useUploads.getState().trays['hoi-dap'] ?? []).toHaveLength(0)
    })

    it('leaves another drop target on the page alone (the picture of a new server)', () => {
        render(
            <QueryClientProvider client={new QueryClient()}>
                <section>
                    <ChatDropZone channelId='hoi-dap' channelName='hoi-dap' permissions={OPEN} />
                </section>
                <div
                    data-testid='icon-drop'
                    onDragOver={(event) => {
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'copy'
                    }}
                />
            </QueryClientProvider>
        )
        const event = drag(screen.getByTestId('icon-drop'), 'dragOver')
        expect((event as DragEvent).dataTransfer!.dropEffect).toBe('copy')
    })

    it('keeps the browser from opening a file dropped anywhere else on the page', () => {
        renderZone()
        expect(drag(screen.getByTestId('panel'), 'dragOver').defaultPrevented).toBe(true)
        expect(drag(screen.getByTestId('panel'), 'drop', [new File(['x'], 'a.jpg')]).defaultPrevented).toBe(true)
        expect(useUploads.getState().trays['hoi-dap'] ?? []).toHaveLength(0)
    })
})

describe('A file waiting for the network (C-41 offline)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
        vi.spyOn(URL, 'revokeObjectURL').mockReturnValue()
    })
    afterEach(() => {
        for (const id of Object.keys(useUploads.getState().uploads)) removeUpload(id)
        vi.restoreAllMocks()
    })

    it('shows "Chờ có mạng" on a tile chosen offline, and still counts it as uploading', async () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
        const { container } = renderChat([])
        await screen.findByText(/Đây là đầu kênh/)

        fireEvent.change(container.querySelector('input[type=file]')!, {
            target: { files: [new File(['x'], 'cau4-2.jpg')] }
        })

        expect(await screen.findByRole('button', { name: 'cau4-2.jpg, Chờ có mạng' })).toBeInTheDocument()
        expect(screen.getByText('Đang tải lên 0/1')).toBeInTheDocument()
    })
})
