/**
 * Display name and bio rules, the API's (SRS REQ-AUTH-06, D-69, D-139):
 * composed (NFC) and trimmed, counted in code points, so the counter shows
 * what the API will count. `value.length` counts UTF-16 units: an emoji is 2.
 */
export const DISPLAY_NAME_MAX_LENGTH = 32

export const BIO_MAX_LENGTH = 200

/** Whitespace and the characters Unicode draws as nothing (U+200B, U+3164…). */
const INVISIBLE = /[\s\p{Default_Ignorable_Code_Point}]/gu

const CONTROL = /\p{Cc}/u

/** The form the API checks and stores. */
export function normaliseProfileText(text: string): string {
    return text.normalize('NFC').trim()
}

/** Characters as the API counts them, after normalising. */
export function characterCount(text: string): number {
    return [...normaliseProfileText(text)].length
}

/** At most `max` characters, cut between code points (an emoji is never split). */
export function cutTo(text: string, max: number): string {
    const characters = [...text]
    return characters.length > max ? characters.slice(0, max).join('') : text
}

/** Why a display name would be refused: empty (or only invisible), or too long. */
export function displayNameIssue(name: string): 'required' | 'tooLong' | undefined {
    const normalised = normaliseProfileText(name)
    if (!normalised.replace(INVISIBLE, '') || CONTROL.test(normalised)) return 'required'
    if ([...normalised].length > DISPLAY_NAME_MAX_LENGTH) return 'tooLong'
    return undefined
}

export function bioIssue(bio: string): 'tooLong' | undefined {
    return characterCount(bio) > BIO_MAX_LENGTH ? 'tooLong' : undefined
}
