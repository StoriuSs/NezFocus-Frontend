import { useRef } from 'react'
import { useMutation, type UseMutationOptions } from '@tanstack/react-query'
import { generateIdempotencyKey } from '@/lib/idempotency'

type IdempotentMutationOptions<TData, TError, TVariables, TContext> = Omit<
    UseMutationOptions<TData, TError, TVariables, TContext>,
    'mutationFn'
> & {
    /** Receives the key to send as the `Idempotency-Key` header. */
    mutationFn: (variables: TVariables, idempotencyKey: string) => Promise<TData>
}

interface Operation<TData> {
    key: string
    variables: unknown
    inFlight?: Promise<TData>
}

/**
 * `useMutation` for endpoints marked `@Idempotent` on the backend.
 *
 * The key identifies one user *intent*, not one HTTP attempt:
 *
 * - **Same payload, not yet successful** — reuses the key. A retry after a
 *   timeout or dropped connection is recognised by the server: if the first
 *   attempt actually went through, the cached response comes back instead of
 *   the action running twice. (The server does not cache failures, so retrying
 *   after a real error runs the action again, as it should.)
 * - **Same payload while a request is still in flight** — returns that request's
 *   promise instead of sending another, so a double click is one request.
 * - **Different payload** — new key. The server keys on the header alone, so
 *   reusing a key for edited input would replay the old response and silently
 *   drop the edit.
 * - **After success** — the next call gets a new key, so doing the same thing
 *   again on purpose is not mistaken for a repeat.
 */
export function useIdempotentMutation<TData = unknown, TError = Error, TVariables = void, TContext = unknown>(
    options: IdempotentMutationOptions<TData, TError, TVariables, TContext>
) {
    const operation = useRef<Operation<TData> | null>(null)
    const { mutationFn, ...rest } = options

    return useMutation<TData, TError, TVariables, TContext>({
        ...rest,
        mutationFn: (variables) => {
            const current = operation.current
            if (current && isSamePayload(current.variables, variables)) {
                if (current.inFlight) return current.inFlight
            } else {
                operation.current = { key: generateIdempotencyKey(), variables }
            }

            const op = operation.current!
            const request = mutationFn(variables, op.key).then(
                (data) => {
                    // Done: the next call is a new intent.
                    if (operation.current === op) operation.current = null
                    return data
                },
                (error) => {
                    // Keep the key so a retry of the same payload is recognised.
                    op.inFlight = undefined
                    throw error
                }
            )
            op.inFlight = request
            return request
        }
    })
}

/**
 * Plain JSON payloads compare by value; anything else (Blob, FormData, class
 * instances) by identity — two Blobs cannot be cheaply proven equal, and a new
 * one means a new upload.
 */
export function isSamePayload(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true
    const left = stableStringify(a)
    return left !== undefined && left === stableStringify(b)
}

function stableStringify(value: unknown): string | undefined {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return JSON.stringify(value)
    }
    if (value === undefined) return 'undefined'
    if (Array.isArray(value)) {
        const items = value.map(stableStringify)
        return items.includes(undefined) ? undefined : `[${items.join(',')}]`
    }
    if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        const entries: string[] = []
        for (const key of Object.keys(value).sort()) {
            const item = stableStringify((value as Record<string, unknown>)[key])
            if (item === undefined) return undefined
            entries.push(`${JSON.stringify(key)}:${item}`)
        }
        return `{${entries.join(',')}}`
    }
    return undefined
}
