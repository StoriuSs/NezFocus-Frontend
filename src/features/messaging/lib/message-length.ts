/** Longest message (REQ-MSG-01). */
export const MAX_MESSAGE_LENGTH = 2000
/** The counter shows once this many or fewer are left (C-12 › Bộ đếm ký tự). */
const COUNTER_FROM = 200

/** Characters as the API counts them: an emoji is one (code points, not UTF-16 units). */
export const characters = (text: string) => [...text].length

/**
 * What the counter under the composer says: nothing while more than 200 are
 * left, then how many ("còn 200" … "còn 0"), then how many too many ("−12").
 * Counts what would be sent: the blank around the text is dropped.
 */
export function lengthNotice(text: string): { left: number } | null {
    const left = MAX_MESSAGE_LENGTH - characters(text.trim())
    return left > COUNTER_FROM ? null : { left }
}
