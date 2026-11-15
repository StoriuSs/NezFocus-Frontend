import { getApiErrorType } from '@/lib/api-error'
import { useUploads, type Refusal, type Upload } from '../attachment-tray.store'
import { isUploading, kindOf, UPLOADS_AT_ONCE } from '../lib/attachment-rules'
import { postFile, UploadError } from '../lib/upload-file'
import type { Attachment } from '../types'
import { completeUpload, requestUpload } from './attachments.api'

/**
 * Uploading the files chosen for messages (D-93, D-165), outside React: a
 * file keeps uploading when its tray is no longer drawn. Each one: a form
 * from the API, the file posted with it straight to the storage, then its
 * content checked. Three at a time, the rest waiting in the order chosen.
 * A form whose 15 minutes ran out is asked for again once (S-CHAT-04).
 *
 * The browser offline (owner, 15/11/2026): every file not done waits for the
 * network (`offline`, "Chờ có mạng"), those on their way stopped, and all
 * upload again from the start once it is back (C-41). Lost on the way while
 * the browser says it is online (the storage or the API not answering):
 * `failed`, "Thử lại".
 */

const working = new Map<string, AbortController>()
let listening = false

/** Once, for as long as the app runs: the browser going offline and coming back. */
function listen(): void {
    if (listening) return
    listening = true
    window.addEventListener('offline', waitForNetwork)
    window.addEventListener('online', () => {
        const { uploads, change } = useUploads.getState()
        for (const upload of Object.values(uploads))
            if (upload.state === 'offline') change(upload.id, { state: 'waiting', progress: 0 })
        pump()
    })
}

/** Every file not done yet waits for the network; those on their way stop. */
function waitForNetwork(): void {
    for (const controller of working.values()) controller.abort()
    working.clear()
    const { uploads, change } = useUploads.getState()
    for (const upload of Object.values(uploads))
        if (isUploading(upload.state)) change(upload.id, { state: 'offline', progress: 0 })
}

/**
 * Every file of one channel, in its tray or in its messages on their way,
 * stopped and let go: its history left the cache (signing out clears it; a
 * channel one may no longer read is forgotten).
 */
export function dropChannelUploads(channelId: string): void {
    for (const upload of Object.values(useUploads.getState().uploads))
        if (upload.channelId === channelId) removeUpload(upload.id)
}

/** A file of a tray, or of a message, still on its way: leaving the page would lose it (C-12 › Luật). */
export const uploadsOnTheWay = (): boolean =>
    Object.values(useUploads.getState().uploads).some((upload) => isUploading(upload.state))

/** Puts the files in the channel's tray and starts them. They were sorted first (`sortChosen`). */
export function addToTray(channelId: string, files: File[]): void {
    listen()
    useUploads.getState().put(
        files.map(
            (file): Upload => ({
                id: crypto.randomUUID(),
                channelId,
                file,
                kind: kindOf(file.name) ?? 'text',
                preview: kindOf(file.name) === 'image' ? URL.createObjectURL(file) : null,
                state: 'waiting',
                progress: 0,
                attachment: null,
                refusal: null
            })
        )
    )
    pump()
}

/** Takes a file out (`x`, Delete): its upload stops, and it is never sent, even if it just finished. */
export function removeUpload(id: string): void {
    working.get(id)?.abort()
    working.delete(id)
    useUploads.getState().drop(id)
    pump()
}

/** "Thử lại" on a file that failed: it uploads again from this device. */
export function retryUpload(id: string): void {
    const upload = useUploads.getState().uploads[id]
    if (!upload || upload.state !== 'failed') return
    useUploads.getState().change(id, { state: 'waiting', progress: 0, attachment: null, refusal: null })
    pump()
}

/**
 * Files the backend no longer has (gone after 24 hours, or sent already): to
 * upload again, like a failed one (S-CHAT-04 › Trường hợp biên).
 */
export function markGone(attachmentIds: string[]): void {
    const { uploads, change } = useUploads.getState()
    for (const upload of Object.values(uploads)) {
        if (upload.attachment && attachmentIds.includes(upload.attachment.id))
            change(upload.id, { state: 'failed', progress: 0, attachment: null })
    }
}

/**
 * Once each of the files is checked, their files in that order; null as soon
 * as one fails or is refused (the message then fails too, D-93) or is taken out.
 */
export function whenUploaded(ids: string[]): Promise<Attachment[] | null> {
    return new Promise((resolve) => {
        const look = (): boolean => {
            const { uploads } = useUploads.getState()
            const files = ids.map((id) => uploads[id])
            if (files.some((file) => !file || file.state === 'failed' || file.state === 'rejected')) {
                resolve(null)
                return true
            }
            if (files.every((file) => file!.state === 'done')) {
                resolve(files.map((file) => file!.attachment!))
                return true
            }
            return false
        }
        if (look()) return
        const stop = useUploads.subscribe(() => {
            if (look()) stop()
        })
    })
}

/**
 * A refusal no retry changes, or null for one worth trying again (the
 * network, the storage busy). An answer is not a failure to try again: the
 * channel taking no more files from this person, a size or type the
 * backend refuses, content not what its name says.
 */
function refusalOf(error: unknown, checking: boolean): Refusal | null {
    switch (getApiErrorType(error)) {
        case 'UPLOAD_INVALID_TYPE':
            return checking ? 'content' : 'type'
        case 'UPLOAD_FILE_TOO_LARGE':
            return 'too-large'
        case 'FORBIDDEN_ERROR':
        case 'MEMBER_TIMED_OUT':
        case 'NOT_FOUND_ERROR':
            return 'not-allowed'
        default:
            return null
    }
}

/** Starts the files waiting, oldest first, while fewer than 3 are on their way. */
function pump(): void {
    if (!navigator.onLine) return waitForNetwork()
    const waiting = Object.values(useUploads.getState().uploads).filter((upload) => upload.state === 'waiting')
    for (const upload of waiting) {
        if (working.size >= UPLOADS_AT_ONCE) return
        void run(upload)
    }
}

async function run(upload: Upload): Promise<void> {
    const { change } = useUploads.getState()
    const controller = new AbortController()
    working.set(upload.id, controller)
    change(upload.id, { state: 'uploading', progress: 0 })
    const here = () => useUploads.getState().uploads[upload.id] !== undefined && !controller.signal.aborted
    /** Past the upload: a refused type now is the content's, not the name's. */
    let checking = false
    try {
        let ticket = await requestUpload(upload.channelId, upload.file.name, upload.file.size)
        const send = () =>
            postFile(
                ticket.upload,
                upload.file,
                (share) => here() && change(upload.id, { progress: share }),
                controller.signal
            )
        try {
            await send()
        } catch (error) {
            // A form past its 15 minutes on a slow network: one more try with a new one.
            if (!(error instanceof UploadError) || error.reason !== 'refused') throw error
            ticket = await requestUpload(upload.channelId, upload.file.name, upload.file.size)
            await send()
        }
        if (!here()) return
        checking = true
        change(upload.id, { state: 'checking', progress: 1 })
        const attachment = await completeUpload(ticket.attachmentId)
        if (here()) change(upload.id, { state: 'done', attachment })
    } catch (error) {
        if (!here()) return
        const refusal = refusalOf(error, checking)
        change(
            upload.id,
            refusal
                ? { state: 'rejected', refusal, progress: 0 }
                : { state: navigator.onLine ? 'failed' : 'offline', progress: 0 }
        )
    } finally {
        if (working.get(upload.id) === controller) working.delete(upload.id)
        pump()
    }
}
