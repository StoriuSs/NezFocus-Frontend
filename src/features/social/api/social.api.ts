import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { PersonProfile, Relationship, RelationshipList, SendFriendRequest } from '../types'

/** GET /me/relationships: everyone of the Friends page, in one read (D-242). */
export async function fetchRelationships(): Promise<Relationship[]> {
    const response = await api.get<ApiEnvelope<RelationshipList>>('/me/relationships')
    return response.data.data.relationships
}

/** GET /users/lookup: someone by username, with where we stand and the servers we share (D-110). */
export async function lookUpPerson(username: string): Promise<PersonProfile> {
    const response = await api.get<ApiEnvelope<PersonProfile>>('/users/lookup', { params: { username } })
    return response.data.data
}

/**
 * POST /me/relationships: a request by username, with a note; friends at
 * once when they had asked me (REQ-SOCIAL-01). `@Idempotent`.
 */
export async function sendFriendRequest(body: SendFriendRequest, idempotencyKey: string): Promise<Relationship> {
    const response = await api.post<ApiEnvelope<Relationship>>('/me/relationships', body, {
        headers: { 'Idempotency-Key': idempotencyKey }
    })
    return response.data.data
}

/** POST /me/relationships/{id}/accept: a request to me only; gone meanwhile → NOT_FOUND_ERROR. `@Idempotent`. */
export async function acceptFriendRequest(userId: string, idempotencyKey: string): Promise<Relationship> {
    const response = await api.post<ApiEnvelope<Relationship>>(`/me/relationships/${userId}/accept`, undefined, {
        headers: { 'Idempotency-Key': idempotencyKey }
    })
    return response.data.data
}

/** DELETE /me/relationships/{id}: declines, cancels or unfriends, whichever there is. */
export async function removeRelationship(userId: string): Promise<Relationship> {
    const response = await api.delete<ApiEnvelope<Relationship>>(`/me/relationships/${userId}`)
    return response.data.data
}

/** PUT /me/blocks/{id}: blocks, the friendship and requests between us gone (REQ-SOCIAL-03). */
export async function blockPerson(userId: string): Promise<Relationship> {
    const response = await api.put<ApiEnvelope<Relationship>>(`/me/blocks/${userId}`)
    return response.data.data
}

/** DELETE /me/blocks/{id}: unblocks; no friendship comes back (D-107). */
export async function unblockPerson(userId: string): Promise<Relationship> {
    const response = await api.delete<ApiEnvelope<Relationship>>(`/me/blocks/${userId}`)
    return response.data.data
}
