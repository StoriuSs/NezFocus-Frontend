import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { queryWrapper } from '@/test/helpers'

describe('useIdempotentMutation', () => {
    it('sends one key per user intent: the same on a retry, a new one for a changed payload', async () => {
        const fn = vi
            .fn<(variables: Record<string, string>, key: string) => Promise<string>>()
            .mockRejectedValueOnce(new Error('timeout'))
            .mockResolvedValue('ok')
        const { result } = renderHook(() => useIdempotentMutation({ mutationFn: fn }), { wrapper: queryWrapper() })

        // A retry of the same payload (key order aside) is the same intent: the API replays, not repeats.
        await act(() => result.current.mutateAsync({ displayName: 'A', bio: 'B' }).catch(() => {}))
        await act(() => result.current.mutateAsync({ bio: 'B', displayName: 'A' }))
        expect(fn.mock.calls[1]![1]).toBe(fn.mock.calls[0]![1])

        // An edit is a new intent, never answered with the stale replay.
        await act(() => result.current.mutateAsync({ displayName: 'C', bio: 'B' }))
        expect(fn.mock.calls[2]![1]).not.toBe(fn.mock.calls[1]![1])
    })
})
