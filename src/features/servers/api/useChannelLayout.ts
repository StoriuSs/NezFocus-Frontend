import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { getApiErrorType } from '@/lib/api-error'
import { applyMove } from '../lib/channel-layout'
import { layoutRule } from '../lib/layout-error'
import { serverKeys } from './keys'
import {
    createCategory,
    createChannel,
    deleteCategory,
    deleteChannel,
    moveInLayout,
    renameCategory,
    updateChannel
} from './layout.api'
import { rememberServer } from './useServers'
import type { CreateChannelRequest, LayoutMove, Server, UpdateChannelRequest } from '../types'

/**
 * A category at the end of the list (S-SRV-05 `category`). One key per name
 * typed: "Create" again after a lost answer is recognised, not made twice.
 * Errors are the dialog's to show.
 */
export function useCreateCategory(serverId: string) {
    const queryClient = useQueryClient()
    return useIdempotentMutation({
        mutationFn: (name: string, idempotencyKey) => createCategory(serverId, name, idempotencyKey),
        onSuccess: ({ server }) => rememberServer(queryClient, server),
        meta: { errorToast: false }
    })
}

/** A channel at the end of its group (S-SRV-05), one key per channel as filled in. */
export function useCreateChannel(serverId: string) {
    const queryClient = useQueryClient()
    return useIdempotentMutation({
        mutationFn: (body: CreateChannelRequest, idempotencyKey) => createChannel(serverId, body, idempotencyKey),
        onSuccess: ({ server }) => rememberServer(queryClient, server),
        meta: { errorToast: false }
    })
}

// The changes below are not `@Idempotent`. Each answers with the whole
// server, which replaces the rail's copy. Errors are the dialog's to show;
// one that means the category or channel is gone (NOT_FOUND_ERROR, deleted
// meanwhile, or by this same delete sent again after a lost answer) also
// reads the list again, so the rail stops showing it.

function readAgainIfGone(queryClient: QueryClient, error: unknown) {
    if (getApiErrorType(error) === 'NOT_FOUND_ERROR')
        void queryClient.invalidateQueries({ queryKey: serverKeys.list() })
}

/** "Category settings" (S-SET-05 `category-edit`): a new name. */
export function useRenameCategory(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) =>
            renameCategory(serverId, categoryId, name),
        onSuccess: (server) => rememberServer(queryClient, server),
        onError: (error) => readAgainIfGone(queryClient, error),
        meta: { errorToast: false }
    })
}

/** "Delete category" (S-SET-05): its channels move to the top of the list. */
export function useDeleteCategory(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (categoryId: string) => deleteCategory(serverId, categoryId),
        onSuccess: (server) => rememberServer(queryClient, server),
        onError: (error) => readAgainIfGone(queryClient, error),
        meta: { errorToast: false }
    })
}

/** "Channel settings" (S-SET-05): only what differs from the channel goes out. */
export function useUpdateChannel(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ channelId, changes }: { channelId: string; changes: UpdateChannelRequest }) =>
            updateChannel(serverId, channelId, changes),
        onSuccess: (server) => rememberServer(queryClient, server),
        onError: (error) => readAgainIfGone(queryClient, error),
        meta: { errorToast: false }
    })
}

/** "Delete #viec-nhom?" (S-SET-05 `delete-confirm`). */
export function useDeleteChannel(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (channelId: string) => deleteChannel(serverId, channelId),
        onSuccess: (server) => rememberServer(queryClient, server),
        onError: (error) => readAgainIfGone(queryClient, error),
        meta: { errorToast: false }
    })
}

/**
 * One drop in the channel list (C-06), saved as docs/data-fetching.md ›
 * Optimistic saves: shown at once, sent, and put back if refused, with "Try
 * again" in the toast, which sends the same move. Refused because the list
 * changed under them (`stale_move`): the list is read again. The server
 * travels with the move, not with the hook: the list may show another server
 * by the time "Try again" is clicked.
 */
export function useMoveInLayout() {
    const queryClient = useQueryClient()
    const { t } = useTranslation()
    const move = useMutation({
        mutationFn: ({ serverId, change }: { serverId: string; change: LayoutMove }) => moveInLayout(serverId, change),
        onMutate: async ({ serverId, change }) => {
            // A read of the list landing now would undo the move on screen.
            await queryClient.cancelQueries({ queryKey: serverKeys.list() })
            const before = queryClient.getQueryData<Server[]>(serverKeys.list())?.find((s) => s.id === serverId)
            if (before) rememberServer(queryClient, applyMove(before, change))
            return { before }
        },
        onSuccess: (server) => rememberServer(queryClient, server),
        onError: (error, sent, context) => {
            if (context?.before) rememberServer(queryClient, context.before)
            if (layoutRule(error)?.rule === 'stale_move' || getApiErrorType(error) === 'NOT_FOUND_ERROR')
                void queryClient.invalidateQueries({ queryKey: serverKeys.list() })
            toast.error(t('shell.drag.saveFailed'), {
                action: { label: t('shell.drag.retry'), onClick: () => move.mutate(sent) }
            })
        },
        // Its own toast above, with "Try again".
        meta: { errorToast: false }
    })
    return move
}
