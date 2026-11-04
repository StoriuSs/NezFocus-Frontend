/**
 * Generates an RFC 4122 version-4 UUID for the `Idempotency-Key` header.
 *
 * `crypto.randomUUID()` only exists in secure contexts — HTTPS or localhost.
 * Opened over plain HTTP (a deployment reached by LAN IP, a staging box without
 * TLS yet) it is `undefined`, and calling it throws, which used to break every
 * mutation. `crypto.getRandomValues()` is available in every context and is
 * the same CSPRNG, so the fallback is equally strong.
 */
export function generateIdempotencyKey(): string {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }

    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6]! & 0x0f) | 0x40 // version 4
    bytes[8] = (bytes[8]! & 0x3f) | 0x80 // RFC 4122 variant

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
