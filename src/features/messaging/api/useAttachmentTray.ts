import { useShallow } from 'zustand/react/shallow'
import { useUploads, type Upload } from '../attachment-tray.store'
import { addToTray, removeUpload, retryUpload } from './attachmentUploads'

const inError = (upload: Upload) => upload.state === 'failed' || upload.state === 'rejected'

/**
 * The channel's tray (C-12 › AttachmentTray), in the order chosen, what it
 * says of itself, and what can be done with it: files uploading as soon as
 * they are added (D-93), taken out, tried again.
 */
export function useAttachmentTray(channelId: string) {
    const uploads = useUploads(
        useShallow((state) => (state.trays[channelId] ?? []).flatMap((id) => state.uploads[id] ?? []))
    )
    return {
        uploads,
        /** Checked, ready to go. */
        done: uploads.filter((upload) => upload.state === 'done').length,
        /** A tile in error: Enter sends nothing until it is taken out or tried again (D-93). */
        blocked: uploads.some(inError),
        add: (files: File[]) => addToTray(channelId, files),
        remove: removeUpload,
        retry: retryUpload
    }
}
