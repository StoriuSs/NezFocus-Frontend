import { MENTION_TOKEN } from './markdown'
import { findMentions } from './mentions'
import type { MentionedRole, MentionedUser } from '../types'

/*
 * The composer holds the text as it is sent, mentions as tokens (<@id>), and
 * shows each token it has a name for as that name ("@Bình"): the names of
 * the suggestions picked, kept with the draft (C-12, REQ-MSG-03). Typing is
 * read back onto the text: right before or after a mention keeps it, inside
 * it turns it into the words it showed, as if typed by hand (owner,
 * 14/11/2026: only a picked suggestion is a mention).
 */

/** Token → what the box shows for it. */
export type ComposerNames = Readonly<Record<string, string>>

interface Segment {
    raw: string
    shown: string
    mention: boolean
}

/** The text in pieces: the words between tokens, and each token with a name. */
function segments(markup: string, names: ComposerNames): Segment[] {
    const pieces: Segment[] = []
    let from = 0
    const words = (raw: string) => {
        if (raw) pieces.push({ raw, shown: raw, mention: false })
    }
    for (const match of markup.matchAll(MENTION_TOKEN)) {
        const shown = names[match[0]]
        if (shown === undefined) continue
        words(markup.slice(from, match.index))
        pieces.push({ raw: match[0], shown, mention: true })
        from = match.index + match[0].length
    }
    words(markup.slice(from))
    return pieces
}

/** What the box shows for the text. */
export const shownText = (markup: string, names: ComposerNames): string =>
    segments(markup, names)
        .map((piece) => piece.shown)
        .join('')

/**
 * The text with what the box shows between `from` and `to` replaced by
 * `insert` (written as is: a token in it is a token). A mention the change
 * lands inside, or overlaps, turns into its words first; one it only touches
 * at its edge stays.
 */
export function replaceShown(markup: string, names: ComposerNames, from: number, to: number, insert: string): string {
    let at = 0
    let result = ''
    let inserted = false
    for (const piece of segments(markup, names)) {
        const start = at
        const end = at + piece.shown.length
        at = end
        const touched = from === to ? start < from && from < end : from < end && to > start
        if (piece.mention && !touched) {
            if (!inserted && from <= start) {
                result += insert
                inserted = true
            }
            result += piece.raw
            continue
        }
        // Words (a mention touched reads as its words): keep what lies outside the change.
        const text = piece.mention ? piece.shown : piece.raw
        if (end <= from || (inserted && start >= to)) {
            result += text
            continue
        }
        result += text.slice(0, Math.max(0, from - start))
        if (!inserted) {
            result += insert
            inserted = true
        }
        result += text.slice(Math.max(0, Math.min(text.length, to - start)))
    }
    return inserted ? result : result + insert
}

/**
 * The text after the box went from showing one thing to `next`, the cursor
 * at `caret` once it changed: the change is what lies between what the two
 * share at the start and at the end, the cursor deciding where when the
 * words alone cannot (deleting one of two like letters).
 */
export function applyEdit(markup: string, names: ComposerNames, next: string, caret = next.length): string {
    const previous = shownText(markup, names)
    let start = 0
    const most = Math.min(previous.length, next.length, caret)
    while (start < most && previous[start] === next[start]) start += 1
    let end = 0
    const tail = Math.min(previous.length - start, next.length - Math.max(start, caret))
    while (end < tail && previous[previous.length - 1 - end] === next[next.length - 1 - end]) end += 1
    return replaceShown(markup, names, start, previous.length - end, next.slice(start, next.length - end))
}

/** An @ or # being typed: the suggestions it asks for. */
export interface TypedMention {
    trigger: '@' | '#'
    /** What follows it, up to the cursor. */
    query: string
    /** Where the @ or # is, in what the box shows. */
    start: number
}

/** The longest word looked up after @ or #. */
const MOST = 32
/** What an @ or # follows when it starts a mention: not a letter, a digit, `_`, `@` or `.` (as for @everyone). */
const JOINED = /[\p{L}\p{N}_@.]/u

/**
 * The @ or # being typed right before the cursor (C-12 › MentionSuggest): at
 * the start or after something not a word, with no space up to the cursor.
 * None right after a mention: its name is no word being typed.
 */
export function typedMention(markup: string, names: ComposerNames, caret: number): TypedMention | null {
    const shown = shownText(markup, names)
    for (let at = caret - 1; at >= 0 && caret - at <= MOST + 1; at -= 1) {
        const char = shown[at]!
        if (/\s/.test(char)) return null
        if (char !== '@' && char !== '#') continue
        if (at > 0 && JOINED.test(shown[at - 1]!)) return null
        if (insideMention(markup, names, at)) return null
        return { trigger: char, query: shown.slice(at + 1, caret), start: at }
    }
    return null
}

function insideMention(markup: string, names: ComposerNames, position: number): boolean {
    let at = 0
    for (const piece of segments(markup, names)) {
        if (piece.mention && at <= position && position < at + piece.shown.length) return true
        at += piece.shown.length
    }
    return false
}

/**
 * A suggestion picked: its token where the word typed was (from the @ to the
 * end of the word, past the cursor when it was inside it), named as
 * `shown`, then a space unless one follows; the cursor after the space.
 * @everyone is a word, not a token, and needs no name.
 */
export function insertMention(
    markup: string,
    names: ComposerNames,
    typed: TypedMention,
    caret: number,
    token: string,
    shown: string
): { markup: string; names: ComposerNames; caret: number } {
    const next = token === shown ? names : { ...names, [token]: shown }
    const box = shownText(markup, names)
    let end = caret
    while (end < box.length && !/\s/.test(box[end]!) && !insideMention(markup, names, end)) end += 1
    const after = box[end]
    const spaced = after !== undefined && /\s/.test(after)
    return {
        markup: replaceShown(markup, names, typed.start, end, spaced ? token : `${token} `),
        names: next,
        caret: typed.start + shown.length + 1
    }
}

/**
 * The mentions of a message on its way, as the composer named them: drawn
 * until the saved one comes back with the names as they are (D-171).
 * @everyone only for someone who may use it; the backend decides in the end.
 */
export function outgoingMentions(
    markup: string,
    names: ComposerNames,
    mayMentionEveryone: boolean
): { mentionUsers: MentionedUser[]; mentionRoles: MentionedRole[]; mentionEveryone: boolean } {
    const found = findMentions(markup)
    const named = (token: string) => names[token]?.slice(1)
    return {
        mentionUsers: found.userIds.flatMap((id) => {
            const name = named(`<@${id}>`)
            return name === undefined ? [] : [{ id, username: null, displayName: name }]
        }),
        mentionRoles: found.roleIds.flatMap((id) => {
            const name = named(`<@&${id}>`)
            return name === undefined ? [] : [{ id, name }]
        }),
        mentionEveryone: mayMentionEveryone && found.everyone
    }
}
