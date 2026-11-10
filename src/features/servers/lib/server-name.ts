/**
 * A server's name, the API's rule (REQ-SRV-01): 2–100 characters once
 * composed (NFC) and trimmed, counted in code points as the API counts them;
 * at least one visible, on one line.
 */
export const SERVER_NAME_MIN_LENGTH = 2
export const SERVER_NAME_MAX_LENGTH = 100

const INVISIBLE = /[\s\p{Default_Ignorable_Code_Point}]/gu
const CONTROL = /\p{Cc}/u

export function normaliseServerName(name: string): string {
    return name.normalize('NFC').trim()
}

export function serverNameLength(name: string): number {
    return [...normaliseServerName(name)].length
}

export function isServerName(name: string): boolean {
    const normalised = normaliseServerName(name)
    const length = [...normalised].length
    return (
        length >= SERVER_NAME_MIN_LENGTH &&
        length <= SERVER_NAME_MAX_LENGTH &&
        !CONTROL.test(normalised) &&
        normalised.replace(INVISIBLE, '').length > 0
    )
}

/**
 * The letters a server without an icon shows (C-05): the first letter of each
 * of its first two words, in capitals. "Ôn thi Giải tích 2" → "ÔT".
 */
export function serverInitials(name: string): string {
    return normaliseServerName(name)
        .split(/\s+/u)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => [...word][0] ?? '')
        .join('')
        .toLocaleUpperCase('vi')
}

/** The most servers one may be in (REQ-SRV-01): known ahead, so creating or joining says so before a request. */
export const MAX_SERVERS = 100
