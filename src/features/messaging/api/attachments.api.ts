import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { Attachment, UploadTicket } from '../types'

/**
 * POST /attachments (REQ-MSG-04, D-165): a form to upload one file for the
 * channel, valid 15 minutes. Needs ATTACH_FILES there; the name's type and
 * the size are checked again by the backend.
 */
export async function requestUpload(channelId: string, filename: string, size: number): Promise<UploadTicket> {
    const response = await api.post<ApiEnvelope<UploadTicket>>('/attachments', { channelId, filename, size })
    return response.data.data
}

/**
 * POST /attachments/{id}/complete (D-93): the upload is done, its content is
 * checked. Not what its name says: UPLOAD_INVALID_TYPE, and the file is gone.
 * Nothing uploaded yet: UPLOAD_FILE_NOT_FOUND.
 */
export async function completeUpload(attachmentId: string): Promise<Attachment> {
    const response = await api.post<ApiEnvelope<Attachment>>(`/attachments/${attachmentId}/complete`)
    return response.data.data
}

/** GET /attachments/{id}/url: new links to a file whose links ended (they last an hour). */
export async function fetchAttachmentLinks(attachmentId: string): Promise<Attachment> {
    const response = await api.get<ApiEnvelope<Attachment>>(`/attachments/${attachmentId}/url`)
    return response.data.data
}
