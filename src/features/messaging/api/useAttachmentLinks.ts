import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/api-error'
import type { Attachment } from '../types'
import { fetchAttachmentLinks } from './attachments.api'
import { messageKeys } from './keys'

/**
 * A file's links, made new when they ended (they last an hour), through the
 * query cache: an image that fails to load asks once for new ones (`renew`),
 * and a second failure leaves its placeholder, never a broken picture
 * (S-CHAT-04); a download always asks first (`download`), as the page may
 * have been open for hours, and stays in the app when it cannot.
 */
export function useAttachmentLinks(file: Attachment) {
    const client = useQueryClient()
    const [renewed, setRenewed] = useState<Attachment | null>(null)
    const [broken, setBroken] = useState(false)
    const shown = renewed?.id === file.id ? renewed : file

    const links = useCallback(
        () =>
            client.fetchQuery({
                queryKey: messageKeys.attachmentLinks(file.id),
                queryFn: () => fetchAttachmentLinks(file.id),
                staleTime: 0
            }),
        [client, file.id]
    )

    const renew = useCallback(() => {
        if (renewed) return setBroken(true)
        links().then(setRenewed, () => setBroken(true))
    }, [links, renewed])

    const download = useCallback(
        (save: (url: string) => void) =>
            links().then(
                (fresh) => {
                    setRenewed(fresh)
                    save(fresh.downloadUrl)
                },
                (error: unknown) => toast.error(getApiErrorMessage(error))
            ),
        [links]
    )

    return { file: shown, broken, renew, download }
}
