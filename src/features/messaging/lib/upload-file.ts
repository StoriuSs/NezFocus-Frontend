import axios from 'axios'

/**
 * The files a send named as not sendable (UPLOAD_FILE_NOT_FOUND: gone after
 * 24 hours, or sent already), to upload again; none for any other answer.
 */
export function goneFiles(error: unknown): string[] {
    if (!axios.isAxiosError(error)) return []
    const ids = (error.response?.data as { data?: { attachmentIds?: unknown } } | undefined)?.data?.attachmentIds
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
}

/** A form to post one file straight to the storage (D-165): every field in order, then the file. */
export interface UploadForm {
    url: string
    fields: Array<{ name: string; value: string }>
}

/**
 * Why an upload did not reach the storage:
 * - `network`: no answer (offline, the storage down);
 * - `refused`: the storage said no, mostly a form past its 15 minutes;
 * - `aborted`: taken back (the file left the tray).
 */
export class UploadError extends Error {
    constructor(readonly reason: 'network' | 'refused' | 'aborted') {
        super(`Upload ${reason}`)
    }
}

/** Longest an upload may take: 25 MB at about 50 KB/s. */
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000

/**
 * Posts `file` with the form, as multipart/form-data, telling the share sent
 * so far (0 to 1). XMLHttpRequest, since fetch tells nothing of what it has
 * sent. Resolves once the storage keeps it.
 */
export function postFile(
    form: UploadForm,
    file: Blob,
    onProgress: (share: number) => void,
    signal: AbortSignal
): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new UploadError('aborted'))
        const body = new FormData()
        for (const { name, value } of form.fields) body.append(name, value)
        body.append('file', file)

        const request = new XMLHttpRequest()
        request.open('POST', form.url)
        // A connection that stalls must not hold one of the three slots for ever.
        request.timeout = UPLOAD_TIMEOUT_MS
        request.ontimeout = () => reject(new UploadError('network'))
        request.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total)
        }
        request.onload = () =>
            request.status >= 200 && request.status < 300 ? resolve() : reject(new UploadError('refused'))
        request.onerror = () => reject(new UploadError('network'))
        request.onabort = () => reject(new UploadError('aborted'))
        signal.addEventListener('abort', () => request.abort(), { once: true })
        request.send(body)
    })
}
