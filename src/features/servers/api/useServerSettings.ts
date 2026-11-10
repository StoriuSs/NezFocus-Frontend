import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/servers'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { removeServerIcon, updateServer, uploadServerIcon } from './servers.api'
import { serverKeys } from './keys'
import { rememberServer } from './useServers'
import type { Server, UpdateServerRequest } from '../types'

/** Put a field of one server in the cached list (the rail and Overview read it). */
export function patchServer(queryClient: QueryClient, serverId: string, change: Partial<Server>) {
    queryClient.setQueryData<Server[]>(serverKeys.list(), (servers) =>
        servers?.map((server) => (server.id === serverId ? { ...server, ...change } : server))
    )
}

/**
 * A new server picture, cropped (S-SET-01, MANAGE_SERVER). Sent with an
 * Idempotency-Key, so "Use picture" twice stores one. A refusal is toasted
 * by the query client and the crop dialog stays to try again.
 */
export function useUploadServerIcon(serverId: string) {
    const queryClient = useQueryClient()
    return useIdempotentMutation({
        mutationFn: (icon: Blob, idempotencyKey) => uploadServerIcon(serverId, icon, idempotencyKey),
        onSuccess: (iconUrl) => patchServer(queryClient, serverId, { iconUrl })
    })
}

/** Back to the initials, at once and without asking (S-SET-01 › Tương tác). */
export function useRemoveServerIcon(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => removeServerIcon(serverId),
        onSuccess: () => patchServer(queryClient, serverId, { iconUrl: null })
    })
}

/**
 * The server's name (PATCH /servers/{id}). The answer is the server as the
 * list shows it, swapped in whole. Errors are the form's to show, under the
 * name field or as "Could not save". The welcome channel saves through
 * useChooseWelcomeChannel below.
 */
export function useUpdateServer(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (body: UpdateServerRequest) => updateServer(serverId, body),
        onSuccess: (server) => rememberServer(queryClient, server),
        meta: { errorToast: false }
    })
}

/**
 * "Welcome channel" (S-SET-01, D-83): saved as docs/data-fetching.md ›
 * Optimistic saves (04 › Lưu thay đổi): shown at once, put back if refused,
 * with "Could not save" and "Try again", which sends the same choice. The
 * server travels with the choice, as with a drag in the channel list.
 */
export function useChooseWelcomeChannel() {
    const queryClient = useQueryClient()
    const { t } = useTranslation('servers')
    const choose = useMutation({
        mutationFn: ({ serverId, welcomeChannelId }: { serverId: string; welcomeChannelId: string | null }) =>
            updateServer(serverId, { welcomeChannelId }),
        onMutate: async ({ serverId, welcomeChannelId }) => {
            await queryClient.cancelQueries({ queryKey: serverKeys.list() })
            const before = queryClient.getQueryData<Server[]>(serverKeys.list())?.find((s) => s.id === serverId)
            patchServer(queryClient, serverId, { welcomeChannelId })
            return { before: before ? before.welcomeChannelId : undefined }
        },
        onSuccess: (server) => rememberServer(queryClient, server),
        onError: (_error, sent, context) => {
            if (context?.before !== undefined)
                patchServer(queryClient, sent.serverId, { welcomeChannelId: context.before })
            toast.error(t('settings.overview.failed'), {
                action: { label: t('settings.overview.retry'), onClick: () => choose.mutate(sent) }
            })
        },
        // Its own toast above, with "Try again".
        meta: { errorToast: false }
    })
    return choose
}
