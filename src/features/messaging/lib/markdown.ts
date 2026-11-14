/*
 * The formatting a message may carry (REQ-MSG-02; owner's call, M2 L4b): a
 * subset of Discord's. Bold `**`, italic `*` or `_`, strikethrough `~~`,
 * inline code (one or two backticks), code blocks (```, a first line that
 * only names a language is dropped, no colouring), quotes (lines starting
 * with "> "), a backslash before a marker for the marker itself, and http /
 * https addresses as links. No headings, lists, underline, spoilers or
 * `[text](url)`.
 *
 * The text becomes blocks of parts, never HTML: whatever the message says
 * is drawn as text (`<b>` included), and a link is only ever http or https,
 * so `javascript:` stays words (REQ-MSG-02).
 */

export type Inline =
    | { type: 'text'; text: string }
    | { type: 'bold' | 'italic' | 'strike'; children: Inline[] }
    | { type: 'code'; text: string }
    | { type: 'link'; href: string }

export type Block =
    | { type: 'paragraph'; children: Inline[] }
    | { type: 'quote'; children: Inline[] }
    | { type: 'codeBlock'; text: string }

const FENCE = '```'
/** A first line of a code block that only names its language. */
const LANGUAGE = /^[\w#+.-]+$/
/** What a backslash may stand before: the markers themselves. */
const ESCAPABLE = new Set(['\\', '*', '_', '~', '`', '>'])
const URL_START = /^https?:\/\/[^\s<]+/
/** Punctuation after an address that ends the sentence, not the address. */
const TRAILING = /[.,:;!?'"]$/
const WORD = /[\p{L}\p{N}]/u

const isWord = (char: string | undefined) => char !== undefined && WORD.test(char)
const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char)

/** The message as blocks: paragraphs and quotes of inline parts, and code blocks. */
export function parseMessage(content: string): Block[] {
    const blocks: Block[] = []
    let rest = content
    for (;;) {
        const open = rest.indexOf(FENCE)
        const close = open === -1 ? -1 : rest.indexOf(FENCE, open + FENCE.length)
        if (close === -1) break
        // The line breaks on each side of a fence belong to it.
        blocks.push(...proseBlocks(rest.slice(0, open).replace(/\n$/, '')))
        blocks.push({ type: 'codeBlock', text: codeOf(rest.slice(open + FENCE.length, close)) })
        rest = rest.slice(close + FENCE.length).replace(/^\n/, '')
    }
    blocks.push(...proseBlocks(rest))
    return blocks
}

/** A code block's text: without a first line naming its language, nor the line breaks by the fences. */
function codeOf(inside: string): string {
    const lineEnd = inside.indexOf('\n')
    const firstLine = lineEnd === -1 ? '' : inside.slice(0, lineEnd)
    const body = LANGUAGE.test(firstLine) && inside.slice(lineEnd + 1).trim() ? inside.slice(lineEnd + 1) : inside
    return body.replace(/^\n/, '').replace(/\n$/, '')
}

/** Text outside code blocks: runs of quoted lines, and paragraphs between them. */
function proseBlocks(text: string): Block[] {
    if (!text) return []
    const blocks: Block[] = []
    let run = null as { quote: boolean; lines: string[] } | null
    const flush = () => {
        if (!run) return
        const children = parseInline(run.lines.join('\n'))
        if (children.length) blocks.push({ type: run.quote ? 'quote' : 'paragraph', children })
    }
    for (const line of text.split('\n')) {
        const quote = line.startsWith('> ')
        const kept = quote ? line.slice(2) : line
        if (run?.quote === quote) run.lines.push(kept)
        else {
            flush()
            run = { quote, lines: [kept] }
        }
    }
    flush()
    return blocks
}

/** The inline parts of a piece of text; neighbouring text joined into one part. */
export function parseInline(text: string): Inline[] {
    const parts: Inline[] = []
    let plain = ''
    const push = (part: Inline) => {
        if (plain) parts.push({ type: 'text', text: plain })
        plain = ''
        parts.push(part)
    }

    let at = 0
    while (at < text.length) {
        const char = text[at]!
        const next = text[at + 1]

        if (char === '\\' && next !== undefined && ESCAPABLE.has(next)) {
            plain += next
            at += 2
            continue
        }

        if (char === '`') {
            const code = codeSpan(text, at)
            if (code) {
                push({ type: 'code', text: code.text })
                at = code.end
                continue
            }
            const run = text.slice(at).match(/^`+/)![0]
            plain += run
            at += run.length
            continue
        }

        if (char === 'h' && !isWord(text[at - 1])) {
            const href = address(text.slice(at))
            if (href) {
                push({ type: 'link', href })
                at += href.length
                continue
            }
        }

        const span = delimited(text, at)
        if (span) {
            push({ type: span.type, children: parseInline(span.inside) })
            at = span.end
            continue
        }

        plain += char
        at += 1
    }
    if (plain) parts.push({ type: 'text', text: plain })
    return parts
}

/** Inline code opening at `at`: a run of one or two backticks, closed by the same run. */
function codeSpan(text: string, at: number): { text: string; end: number } | null {
    const run = text.slice(at).match(/^`+/)![0]
    if (run.length > 2) return null
    let from = at + run.length
    for (;;) {
        const close = text.indexOf(run, from)
        if (close === -1) return null
        // Exactly the same run: a longer one does not close it.
        if (text[close + run.length] === '`' || text[close - 1] === '`') {
            from = close + 1
            continue
        }
        const inside = text.slice(at + run.length, close)
        if (!inside) return null
        const trimmed = inside.startsWith(' ') && inside.endsWith(' ') && inside.trim() ? inside.slice(1, -1) : inside
        return { text: trimmed, end: close + run.length }
    }
}

/** An http or https address at the start of `text`, without the punctuation that ends the sentence. */
function address(text: string): string | null {
    let href = text.match(URL_START)?.[0]
    if (!href) return null
    for (;;) {
        if (TRAILING.test(href)) href = href.slice(0, -1)
        else if (href.endsWith(')') && count(href, '(') < count(href, ')')) href = href.slice(0, -1)
        else break
    }
    return /^https?:\/\/[^/?#]/.test(href) ? href : null
}

const count = (text: string, char: string) => text.split(char).length - 1

type Span = { type: 'bold' | 'italic' | 'strike'; inside: string; end: number }

/** Bold, italic or strikethrough opening at `at`, with what it holds; null if it does not close. */
function delimited(text: string, at: number): Span | null {
    if (text.startsWith('**', at)) {
        const span = closeAt(text, at, '**', (end) => text[end + 2] !== '*')
        if (span) return { type: 'bold', ...span }
    }
    if (text.startsWith('~~', at)) {
        const span = closeAt(text, at, '~~', () => true)
        if (span) return { type: 'strike', ...span }
    }
    if (text[at] === '*' && text[at + 1] !== '*') {
        const span = closeAt(text, at, '*', (end) => text[end - 1] !== '*' && text[end + 1] !== '*')
        if (span) return { type: 'italic', ...span }
    }
    if (text[at] === '_' && text[at + 1] !== '_' && !isWord(text[at - 1])) {
        const span = closeAt(text, at, '_', (end) => !isWord(text[end + 1]) && text[end + 1] !== '_')
        if (span) return { type: 'italic', ...span }
    }
    return null
}

/**
 * Where `marker` opening at `at` closes: the next one after something that
 * is not a space, itself after something that is not a space, and that
 * `fits` (no `*` of a `**` taken as an italic's end). Formatting opens on a
 * word, not on a space ("2 * 3 * 4" stays as it is).
 */
function closeAt(
    text: string,
    at: number,
    marker: string,
    fits: (end: number) => boolean
): { inside: string; end: number } | null {
    const start = at + marker.length
    if (isSpace(text[start])) return null
    let end = text.indexOf(marker, start + 1)
    while (end !== -1) {
        if (!isSpace(text[end - 1]) && fits(end)) return { inside: text.slice(start, end), end: end + marker.length }
        end = text.indexOf(marker, end + 1)
    }
    return null
}

/** What the message says without its markers: read aloud, and quoted in reply lines. */
export function plainText(content: string): string {
    const words = (parts: Inline[]): string =>
        parts
            .map((part) =>
                part.type === 'text' || part.type === 'code'
                    ? part.text
                    : part.type === 'link'
                      ? part.href
                      : words(part.children)
            )
            .join('')
    return parseMessage(content)
        .map((block) => (block.type === 'codeBlock' ? block.text : words(block.children)))
        .join('\n')
}
