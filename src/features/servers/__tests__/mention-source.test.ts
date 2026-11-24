import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { MemberQuery } from '../api/roles.api'
import type { MemberPage, ServerMember } from '../types'

const fetchMembers = vi.fn<(serverId: string, query: MemberQuery) => Promise<MemberPage>>()
vi.mock('../api/roles.api', () => ({ fetchMembers, fetchMentionableRoles: vi.fn() }))

const { useMentionSource } = await import('../api/useMentionSource')

const member = (userId: string, username: string | null, displayName: string | null): ServerMember => ({
    userId,
    username,
    displayName,
    avatarUrl: null,
    isOwner: false,
    roleIds: [],
    joinedAt: '2026-11-01T00:00:00.000Z',
    timeoutUntil: null,
    timeoutReason: null,
    activity: null,
    status: 'offline'
})

describe('useMentionSource', () => {
    it('suggests no account waiting to be deleted: it comes with no name to mention (D-182)', async () => {
        fetchMembers.mockResolvedValue({
            items: [member('binh', 'binh.tran', 'Bình'), member('em', null, null)],
            meta: {
                currentPage: 1,
                itemsPerPage: 50,
                totalItems: 2,
                totalPages: 1,
                hasNextPage: false,
                hasPreviousPage: false
            }
        })
        const { result } = renderHook(() =>
            useMentionSource({ id: 'ot', roleIds: [], categories: [], channels: [] }, '[]')
        )

        const people = await result.current.members('').queryFn()

        expect(people).toEqual([expect.objectContaining({ id: 'binh' })])
    })
})
