import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { apiError } from '@/test/helpers'
import type { Attachment, UploadTicket } from '../types'

const requestUpload = vi.fn<(channelId: string, name: string, size: number) => Promise<UploadTicket>>()
const completeUpload = vi.fn<(id: string) => Promise<Attachment>>()
vi.mock('../api/attachments.api', () => ({ requestUpload, completeUpload, fetchAttachmentLinks: vi.fn() }))

/** Each post waits until the test lets it go (`land`), or fails. */
const posts: Array<{
    resolve: () => void
    reject: (error: unknown) => void
    progress: (share: number) => void
    signal: AbortSignal
}> = []
vi.mock('../lib/upload-file', async (original) => ({
    ...(await original<typeof import('../lib/upload-file')>()),
    postFile: vi.fn(
        (_form: unknown, _file: Blob, onProgress: (share: number) => void, signal: AbortSignal) =>
            new Promise<void>((resolve, reject) => {
                posts.push({ resolve, reject, progress: onProgress, signal })
                signal.addEventListener('abort', () => reject(new Error('aborted')))
            })
    )
}))

const uploads = await import('../api/attachmentUploads')
const { useUploads } = await import('../attachment-tray.store')
const { UploadError } = await import('../lib/upload-file')

const file = (name: string) => new File(['x'], name)
const states = () => (useUploads.getState().trays.c1 ?? []).map((id) => useUploads.getState().uploads[id]!.state)
const ids = () => useUploads.getState().trays.c1 ?? []
const ticket = (n: number): UploadTicket => ({
    attachmentId: `a${n}`,
    upload: { url: 'https://s3.test/b', fields: [{ name: 'key', value: `uploads/${n}` }] },
    expiresAt: new Date().toISOString()
})
const checked = (id: string) => ({ id, filename: 'x', size: 1, contentType: 'image/png' }) as Attachment

describe('uploading the files chosen (D-93, D-165)', () => {
    let next = 0
    beforeEach(() => {
        next = 0
        posts.length = 0
        useUploads.setState({ uploads: {}, trays: {} })
        requestUpload.mockReset().mockImplementation(async () => ticket(++next))
        completeUpload.mockReset().mockImplementation(async (id) => checked(id))
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
        vi.spyOn(URL, 'revokeObjectURL').mockReturnValue()
    })
    afterEach(() => {
        // Stops what a test left on its way: three at a time is counted across tests otherwise.
        for (const id of Object.keys(useUploads.getState().uploads)) uploads.removeUpload(id)
        vi.restoreAllMocks()
    })

    it('uploads three at a time, the rest waiting in the order chosen, then checks each', async () => {
        uploads.addToTray('c1', [file('1.png'), file('2.png'), file('3.png'), file('4.pdf')])

        await waitFor(() => expect(posts).toHaveLength(3))
        expect(states()).toEqual(['uploading', 'uploading', 'uploading', 'waiting'])

        posts[0]!.progress(0.62)
        expect(useUploads.getState().uploads[ids()[0]!]!.progress).toBe(0.62)
        posts[0]!.resolve()
        await waitFor(() => expect(states()[0]).toBe('done'))
        expect(useUploads.getState().uploads[ids()[0]!]!.attachment?.id).toBe('a1')
        // The fourth starts once one is through.
        await waitFor(() => expect(posts).toHaveLength(4))
    })

    it('marks a file refused for its content, and one lost on the way, which uploads again on retry', async () => {
        completeUpload.mockRejectedValueOnce(apiError(415, 'UPLOAD_INVALID_TYPE'))
        uploads.addToTray('c1', [file('cong-thuc.png'), file('mat-mang.png')])
        await waitFor(() => expect(posts).toHaveLength(2))

        posts[0]!.resolve()
        posts[1]!.reject(new UploadError('network'))
        await waitFor(() => expect(states()).toEqual(['rejected', 'failed']))

        uploads.retryUpload(ids()[0]!)
        uploads.retryUpload(ids()[1]!)
        await waitFor(() => expect(posts).toHaveLength(3))
        expect(states()).toEqual(['rejected', 'uploading'])
    })

    it('waits for the network with files chosen offline, and uploads them once the browser is back online (C-41 offline)', async () => {
        const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
        uploads.addToTray('c1', [file('cau4-2.jpg')])

        expect(states()).toEqual(['offline'])
        expect(requestUpload).not.toHaveBeenCalled()

        online.mockReturnValue(true)
        window.dispatchEvent(new Event('online'))
        await waitFor(() => expect(posts).toHaveLength(1))
        expect(states()).toEqual(['uploading'])
    })

    it('stops what is on its way when the browser goes offline, and uploads it again from the start once back online', async () => {
        const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
        uploads.addToTray('c1', [file('1.png'), file('2.png'), file('3.png'), file('4.png')])
        await waitFor(() => expect(posts).toHaveLength(3))

        online.mockReturnValue(false)
        window.dispatchEvent(new Event('offline'))
        await waitFor(() => expect(states()).toEqual(['offline', 'offline', 'offline', 'offline']))
        expect(posts.every((post) => post.signal.aborted)).toBe(true)

        online.mockReturnValue(true)
        window.dispatchEvent(new Event('online'))
        await waitFor(() => expect(posts).toHaveLength(6))
        expect(states()).toEqual(['uploading', 'uploading', 'uploading', 'waiting'])
        expect(useUploads.getState().uploads[ids()[0]!]!.progress).toBe(0)
    })

    it('waits for the network, not "Thử lại", when an upload is lost because the browser went offline', async () => {
        const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
        uploads.addToTray('c1', [file('mat-mang.png')])
        await waitFor(() => expect(posts).toHaveLength(1))

        online.mockReturnValue(false)
        posts[0]!.reject(new UploadError('network'))

        await waitFor(() => expect(states()).toEqual(['offline']))
    })

    it('asks for a new form once when the storage refuses one past its 15 minutes', async () => {
        uploads.addToTray('c1', [file('cham.png')])
        await waitFor(() => expect(posts).toHaveLength(1))

        posts[0]!.reject(new UploadError('refused'))
        await waitFor(() => expect(posts).toHaveLength(2))
        expect(requestUpload).toHaveBeenCalledTimes(2)
        posts[1]!.resolve()
        await waitFor(() => expect(states()).toEqual(['done']))
        expect(completeUpload).toHaveBeenCalledWith('a2')
    })

    it('takes a file out at once, stopping its upload; it never becomes done', async () => {
        uploads.addToTray('c1', [file('bo.png')])
        await waitFor(() => expect(posts).toHaveLength(1))
        const [id] = ids()

        uploads.removeUpload(id!)

        expect(posts[0]!.signal.aborted).toBe(true)
        expect(ids()).toEqual([])
        expect(useUploads.getState().uploads[id!]).toBeUndefined()
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    })

    it('tells when every file of a message is checked, in order, or as soon as one fails', async () => {
        uploads.addToTray('c1', [file('1.png'), file('2.png')])
        await waitFor(() => expect(posts).toHaveLength(2))
        const all = uploads.whenUploaded(ids())
        posts[1]!.resolve()
        posts[0]!.resolve()
        expect((await all)!.map((one) => one.id)).toEqual(['a1', 'a2'])

        uploads.addToTray('c1', [file('3.png')])
        await waitFor(() => expect(posts).toHaveLength(3))
        const one = uploads.whenUploaded([ids().at(-1)!])
        posts[2]!.reject(new UploadError('network'))
        expect(await one).toBeNull()
    })

    it('stops after a second refused form: the file fails, and its slot is free again', async () => {
        uploads.addToTray('c1', [file('cham.png')])
        await waitFor(() => expect(posts).toHaveLength(1))
        posts[0]!.reject(new UploadError('refused'))
        await waitFor(() => expect(posts).toHaveLength(2))
        posts[1]!.reject(new UploadError('refused'))

        await waitFor(() => expect(states()).toEqual(['failed']))
    })

    it('takes a file out while its content is checked: it never becomes done', async () => {
        let check!: () => void
        completeUpload.mockImplementationOnce(
            (id) => new Promise((resolve) => (check = () => resolve({ id } as Attachment)))
        )
        uploads.addToTray('c1', [file('bo.png')])
        await waitFor(() => expect(posts).toHaveLength(1))
        posts[0]!.resolve()
        await waitFor(() => expect(completeUpload).toHaveBeenCalled())
        const [id] = ids()

        uploads.removeUpload(id!)
        check()
        await Promise.resolve()

        expect(useUploads.getState().uploads[id!]).toBeUndefined()
    })

    it('marks gone the files the backend no longer has, to upload again', async () => {
        uploads.addToTray('c1', [file('cu.png')])
        await waitFor(() => expect(posts).toHaveLength(1))
        posts[0]!.resolve()
        await waitFor(() => expect(states()).toEqual(['done']))

        uploads.markGone(['a1'])

        expect(states()).toEqual(['failed'])
        expect(useUploads.getState().uploads[ids()[0]!]!.attachment).toBeNull()
    })
})
