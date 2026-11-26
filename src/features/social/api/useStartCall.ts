import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { startCall } from './calls.api'

/**
 * `POST /dms/{id}/calls` (`@Idempotent`): one key per press, a retry of it
 * the same. No Toast of its own: the press says what came of it
 * (`useCallPress`), the call itself goes through `callHeard`.
 */
export function useStartCall() {
    return useIdempotentMutation({
        mutationFn: ({ dmId, video }: { dmId: string; video: boolean }, idempotencyKey) =>
            startCall(dmId, video, idempotencyKey),
        meta: { errorToast: false }
    })
}
