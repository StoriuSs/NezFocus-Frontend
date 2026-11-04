import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateIdempotencyKey } from '@/lib/idempotency'

// The v4 UUID the backend's Idempotency-Key check accepts.
const V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('generateIdempotencyKey', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('still makes distinct v4 UUIDs where crypto.randomUUID is missing (plain-HTTP origins)', () => {
        // Insecure contexts expose getRandomValues but not randomUUID.
        vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })

        const keys = new Set(Array.from({ length: 50 }, () => generateIdempotencyKey()))

        expect(keys.size).toBe(50)
        for (const key of keys) expect(key).toMatch(V4_PATTERN)
    })
})
