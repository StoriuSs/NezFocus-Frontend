import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/api-error'
import type { Attachment } from '../types'
import { fetchAttachmentLinks } from './attachments.api'
import { messageKeys } from './keys'

/**
 * A file's links, made new when they ended (they last an hour), through the
 * query cache: an image, a video or a sound that fails to load asks once for
 * new ones (`renew`), and a second failure leaves its placeholder, never a
 * broken picture (S-CHAT-04); a download and a new tab always ask first
 * (`download`, `openInTab`), as the page may have been open for hours, and
 * stay in the app when they cannot.
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

    /** Opens one of the new links (`save` gets it): `downloadUrl` saves the file, `url` shows it. */
    const fresh = useCallback(
        (save: (url: string) => void, link: 'url' | 'downloadUrl') =>
            links().then(
                (made) => {
                    setRenewed(made)
                    save(made[link])
                },
                (error: unknown) => toast.error(getApiErrorMessage(error))
            ),
        [links]
    )

    return {
        file: shown,
        broken,
        renew,
        download: useCallback((save: (url: string) => void) => fresh(save, 'downloadUrl'), [fresh]),
        openInTab: useCallback((save: (url: string) => void) => fresh(save, 'url'), [fresh])
    }
}

/**
 * New links for a file shown at once in a frame that cannot say it failed
 * (a PDF in the viewer, C-42): asked for when it opens, then kept while it is
 * open (new links would load it again, back at its first page); until they
 * come, none (`file` null). Asking fails: the links the message came with.
 */
export function useFreshLinks(file: Attachment): Attachment | null {
    const { data, isError } = useQuery({
        queryKey: messageKeys.attachmentFrame(file.id),
        queryFn: () => fetchAttachmentLinks(file.id),
        staleTime: Infinity,
        gcTime: 0,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
        meta: { errorToast: false }
    })
    return data ?? (isError ? file : null)
}
