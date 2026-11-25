import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { serverKeys } from '../api/keys'
import { useRoomLookup } from '../hooks/useRoomLookup'

const SESSION = { status: 'running', phase: 'focus', phaseEndsAt: '2026-11-25T10:18:00.000Z' }
const voiceRoom = (id: string, name: string, people: string[], more: object = {}) => ({
    id,
    name,
    type: 'voice',
    isStudyRoom: false,
    focusSession: null,
    permissions: '0',
    voiceStates: people.map((userId) => ({ user: { id: userId }, isOwner: false, roleIds: [] })),
    ...more
})

function render(client: QueryClient) {
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return renderHook(() => useRoomLookup(), { wrapper })
}

describe('useRoomLookup (the activity line’s room, D-252)', () => {
    it('finds the room someone is in among the rooms of my servers, with its name, kind and session', () => {
        const client = new QueryClient()
        client.setQueryData(serverKeys.list(), [
            {
                id: 'ot',
                isOwner: false,
                topRolePosition: 0,
                roles: [],
                timeoutUntil: null,
                channels: [
                    { id: 'hoi-dap', name: 'hoi-dap', type: 'text', voiceStates: null },
                    voiceRoom('im-lang', 'Phòng học im lặng', ['binh', 'chi'], {
                        isStudyRoom: true,
                        focusSession: SESSION
                    })
                ]
            },
            {
                id: 'nd',
                isOwner: false,
                topRolePosition: 0,
                roles: [],
                timeoutUntil: null,
                channels: [voiceRoom('thao-luan', 'Phòng thảo luận nhóm', ['ha'])]
            }
        ])
        const { result } = render(client)

        expect(result.current.roomOf('chi')).toEqual({
            name: 'Phòng học im lặng',
            isStudyRoom: true,
            session: SESSION
        })
        expect(result.current.roomOf('ha')).toEqual({ name: 'Phòng thảo luận nhóm', isStudyRoom: false, session: null })
        // In no room I see (or a room of a channel I do not view: GET /servers does not hold it).
        expect(result.current.roomOf('giang')).toBeNull()
    })

    it('follows the servers held as people move', async () => {
        const client = new QueryClient()
        client.setQueryData(serverKeys.list(), [
            {
                id: 'ot',
                isOwner: false,
                topRolePosition: 0,
                roles: [],
                timeoutUntil: null,
                channels: [voiceRoom('a', 'Phòng A', ['binh'])]
            }
        ])
        const { result } = render(client)
        expect(result.current.roomOf('binh')).toMatchObject({ name: 'Phòng A' })

        act(
            () =>
                void client.setQueryData(serverKeys.list(), [
                    {
                        id: 'ot',
                        isOwner: false,
                        topRolePosition: 0,
                        roles: [],
                        timeoutUntil: null,
                        channels: [voiceRoom('a', 'Phòng A', [])]
                    }
                ])
        )
        await waitFor(() => expect(result.current.roomOf('binh')).toBeNull())
    })
})
