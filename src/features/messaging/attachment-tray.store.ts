import { create } from 'zustand'
import type { FileKind } from './lib/attachment-rules'
import type { Attachment } from './types'

/**
 * Where a file chosen is (C-41):
 * - `waiting`: behind the 3 uploading ("Đang chờ");
 * - `uploading`: on its way to the storage, `progress` 0 to 1;
 * - `checking`: uploaded, its content being checked (D-93), shown as 100%;
 * - `done`: checked, `attachment` its file;
 * - `failed`: lost on the way, or gone after 24 hours: "Thử lại" uploads it again;
 * - `rejected`: one that can never go (`refusal` says why): only taken out.
 */
export type UploadState = 'waiting' | 'uploading' | 'checking' | 'done' | 'failed' | 'rejected'

/**
 * Why a file can never go: its content is not what its name says (D-93), the
 * channel no longer takes files from this person (ATTACH_FILES, a timeout),
 * or the backend refused its size or type.
 */
export type Refusal = 'content' | 'not-allowed' | 'too-large' | 'type'

export interface Upload {
    /** Chosen here, for this tab only. */
    id: string
    channelId: string
    file: File
    kind: FileKind
    /** An image's picture from the file on this device, shown from the moment it is chosen (C-41). */
    preview: string | null
    state: UploadState
    progress: number
    attachment: Attachment | null
    /** Why it was refused (`rejected`). */
    refusal: Refusal | null
}

interface UploadsState {
    uploads: Record<string, Upload>
    /** Each channel's tray, in the order chosen; kept per channel like the draft. */
    trays: Record<string, string[]>
    put: (uploads: Upload[]) => void
    change: (id: string, change: Partial<Upload>) => void
    /** Out of its tray and gone, its picture let go. */
    drop: (id: string) => void
    /** The tray's files go with a message: the tray is empty again. */
    take: (channelId: string) => string[]
}

/**
 * The files chosen for messages (S-CHAT-04): client state that holds the
 * files themselves, so Zustand, not the query cache
 * (docs/state-management.md). Uploading them is `api/attachmentUploads.ts`.
 */
export const useUploads = create<UploadsState>((set, get) => ({
    uploads: {},
    trays: {},
    put: (uploads) =>
        set((state) => {
            const trays = { ...state.trays }
            for (const upload of uploads) trays[upload.channelId] = [...(trays[upload.channelId] ?? []), upload.id]
            return {
                uploads: { ...state.uploads, ...Object.fromEntries(uploads.map((upload) => [upload.id, upload])) },
                trays
            }
        }),
    change: (id, change) =>
        set((state) => {
            const upload = state.uploads[id]
            return upload ? { uploads: { ...state.uploads, [id]: { ...upload, ...change } } } : state
        }),
    drop: (id) =>
        set((state) => {
            const upload = state.uploads[id]
            if (!upload) return state
            if (upload.preview) URL.revokeObjectURL(upload.preview)
            const { [id]: _gone, ...uploads } = state.uploads
            const tray = state.trays[upload.channelId]?.filter((one) => one !== id)
            return { uploads, trays: tray ? { ...state.trays, [upload.channelId]: tray } : state.trays }
        }),
    take: (channelId) => {
        const ids = get().trays[channelId] ?? []
        set((state) => ({ trays: { ...state.trays, [channelId]: [] } }))
        return ids
    }
}))
