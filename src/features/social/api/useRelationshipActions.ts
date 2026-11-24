import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { getApiErrorType } from '@/lib/api-error'
import { notifyMutationError } from '@/lib/query-client'
import { withoutPerson, withRelationship } from '../lib/relationship-cache'
import type { Relationship, SendFriendRequest } from '../types'
import { socialKeys } from './keys'
import {
    acceptFriendRequest,
    blockPerson,
    lookUpPerson,
    removeRelationship,
    sendFriendRequest,
    unblockPerson
} from './social.api'

/*
 * Every change of a relationship goes through these hooks, from the Friends
 * page and the inbox alike: each puts the answer in the list held, and the
 * event of the same change, coming after, changes nothing more. What a
 * screen says once done (a Toast, a dialog closing) goes to `mutate()`:
 * the words are the screen's, as this module is in the AppShell's chunk
 * (the social index), with no namespace of its own loaded.
 */

/** The answer in its place in the list held; `none` takes the person out. */
function remember(client: QueryClient, entry: Relationship): void {
    client.setQueryData<Relationship[]>(socialKeys.relationships(), (list) => list && withRelationship(list, entry))
}

/**
 * Looks someone up by username (the Add friend dialog's "Find", D-110),
 * on the click: never from the cache, never retried (30 a minute).
 */
export function useLookUpPerson() {
    const client = useQueryClient()
    return (username: string) =>
        client.fetchQuery({
            queryKey: socialKeys.lookup(username),
            queryFn: () => lookUpPerson(username),
            retry: false,
            staleTime: 0
        })
}

/**
 * A request by username with its note (REQ-SOCIAL-01): `outgoing`, or
 * `friend` when they had asked me. Refusals are the dialog's to say, under
 * the field (S-DM-02 › Thêm bạn › Lỗi).
 */
export function useSendFriendRequest() {
    const client = useQueryClient()
    return useIdempotentMutation({
        mutationFn: (body: SendFriendRequest, idempotencyKey) => sendFriendRequest(body, idempotencyKey),
        onSuccess: (entry) => remember(client, entry),
        meta: { errorToast: false }
    })
}

/**
 * Accepts a request to me. Gone meanwhile (cancelled, or I was blocked:
 * one answer, 09 › Edge) → NOT_FOUND_ERROR: the request leaves the list
 * here too, and the screen says "Lời mời không còn hiệu lực". Any other
 * failure is the usual Toast, from here: said even when the screen that
 * asked has closed meanwhile.
 */
export function useAcceptFriendRequest() {
    const client = useQueryClient()
    return useIdempotentMutation({
        mutationFn: (userId: string, idempotencyKey) => acceptFriendRequest(userId, idempotencyKey),
        onSuccess: (entry) => remember(client, entry),
        onError: (error, userId) => {
            if (getApiErrorType(error) !== 'NOT_FOUND_ERROR') return notifyMutationError(error)
            client.setQueryData<Relationship[]>(
                socialKeys.relationships(),
                (list) => list && withoutPerson(list, userId)
            )
        },
        meta: { errorToast: false }
    })
}

/** Declines a request, cancels mine or unfriends: whichever there is (D-237). */
export function useRemoveRelationship() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: (userId: string) => removeRelationship(userId),
        onSuccess: (entry) => remember(client, entry)
    })
}

/** Blocks someone: the friendship and the requests between us go (REQ-SOCIAL-03). */
export function useBlockPerson() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: (userId: string) => blockPerson(userId),
        onSuccess: (entry) => remember(client, entry)
    })
}

/** Unblocks someone; they leave the Blocked tab, no friendship comes back (D-107). */
export function useUnblockPerson() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: (userId: string) => unblockPerson(userId),
        onSuccess: (entry) => remember(client, entry)
    })
}
