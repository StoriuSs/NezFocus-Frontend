/**
 * The small part of Markdown the legal pages are written in (S-PUB-02,
 * docs/legal): a `#` title, the line under it, `##` sections, paragraphs,
 * `-` lists, `**bold**` and `[links](…)`. Read into blocks that React draws,
 * so the text never goes through innerHTML. Anything else stays plain text.
 */

export type Inline =
    | { type: 'text'; text: string }
    | { type: 'bold'; text: string }
    | { type: 'link'; text: string; href: string }

export type Block =
    | { type: 'title'; text: string }
    /** The paragraph right under the title: "Last updated: …". */
    | { type: 'meta'; text: string }
    /** `id` is the section's number ("4" for "4. Conduct"), for links like /terms#4. */
    | { type: 'heading'; text: string; id: string }
    | { type: 'paragraph'; content: Inline[] }
    | { type: 'list'; items: Inline[][] }

/** Only these leave the page: a path on this site, the web, an email. */
function safeHref(href: string): string | null {
    if (href.startsWith('/') && !href.startsWith('//')) return href
    return /^(https?:|mailto:)/i.test(href) ? href : null
}

export function parseInline(text: string): Inline[] {
    const parts: Inline[] = []
    const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g
    let last = 0
    for (const match of text.matchAll(pattern)) {
        const at = match.index ?? 0
        if (at > last) parts.push({ type: 'text', text: text.slice(last, at) })
        if (match[1] !== undefined) {
            parts.push({ type: 'bold', text: match[1] })
        } else {
            const href = safeHref(match[3]!)
            parts.push(href ? { type: 'link', text: match[2]!, href } : { type: 'text', text: match[2]! })
        }
        last = at + match[0].length
    }
    if (last < text.length) parts.push({ type: 'text', text: text.slice(last) })
    return parts
}

function slug(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

export function parseMarkdown(source: string): Block[] {
    const blocks: Block[] = []
    // Blank lines separate blocks; a list is consecutive "- " lines.
    for (const chunk of source.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
        const lines = chunk.split('\n').filter((line) => line.trim())
        if (lines.length === 0) continue
        const first = lines[0]!
        if (first.startsWith('# ')) {
            blocks.push({ type: 'title', text: first.slice(2).trim() })
        } else if (first.startsWith('## ')) {
            const text = first.slice(3).trim()
            const numbered = /^(\d+)\./.exec(text)
            blocks.push({ type: 'heading', text, id: numbered ? numbered[1]! : slug(text) })
        } else if (lines.every((line) => line.startsWith('- '))) {
            blocks.push({ type: 'list', items: lines.map((line) => parseInline(line.slice(2).trim())) })
        } else if (blocks.length === 1 && blocks[0]!.type === 'title') {
            blocks.push({ type: 'meta', text: lines.join(' ') })
        } else {
            blocks.push({ type: 'paragraph', content: parseInline(lines.join(' ')) })
        }
    }
    return blocks
}
