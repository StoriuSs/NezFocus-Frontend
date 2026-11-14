/** Largest file a message takes, in bytes (REQ-MSG-04). The backend and the storage hold it too. */
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024

/** Most files in one message (REQ-MSG-04). */
export const ATTACHMENTS_PER_MESSAGE = 10

/** Files uploading at once; the rest wait their turn (D-93). */
export const UPLOADS_AT_ONCE = 3

/** What a file is, by its extension: what it shows as, and which icon it has (C-10 › Tệp trong tin). */
export type FileKind = 'image' | 'pdf' | 'document' | 'sheet' | 'slides' | 'archive' | 'video' | 'audio' | 'text'

/**
 * Plain text sent as files (D-177): text, data and source code, as the
 * backend's `TEXT_EXTENSIONS` has them. No Windows scripts (bat, cmd, ps1,
 * vbs), which run when opened.
 */
// prettier-ignore
const TEXT_EXTENSIONS = [
    'txt', 'md', 'csv', 'tsv', 'log', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini',
    'html', 'css', 'scss', 'js', 'jsx', 'ts', 'tsx', 'py', 'ipynb', 'c', 'h', 'cpp',
    'hpp', 'cs', 'java', 'kt', 'go', 'rs', 'rb', 'php', 'swift', 'dart', 'sql', 'sh',
    'r', 'm', 'tex'
]

/** The types sent (D-92), by extension. */
const KINDS: Record<string, FileKind> = {
    jpg: 'image',
    jpeg: 'image',
    png: 'image',
    webp: 'image',
    gif: 'image',
    pdf: 'pdf',
    doc: 'document',
    docx: 'document',
    xls: 'sheet',
    xlsx: 'sheet',
    ppt: 'slides',
    pptx: 'slides',
    zip: 'archive',
    rar: 'archive',
    '7z': 'archive',
    mp3: 'audio',
    m4a: 'audio',
    mp4: 'video',
    webm: 'video',
    ...Object.fromEntries(TEXT_EXTENSIONS.map((extension) => [extension, 'text' as const]))
}

/** A file name's extension, lower case, without the dot; empty when it has none (".env" has none). */
export function extensionOf(name: string): string {
    const dot = name.lastIndexOf('.')
    return dot <= 0 || dot === name.length - 1 ? '' : name.slice(dot + 1).toLowerCase()
}

/** The kind a file name says, or null for a type not sent (D-92, D-177). */
export const kindOf = (name: string): FileKind | null => KINDS[extensionOf(name)] ?? null

/** The kind a checked file is, by the type the backend read from its content; its name for anything else. */
export function kindOfContent(contentType: string, name: string): FileKind | null {
    if (contentType.startsWith('image/')) return 'image'
    if (contentType === 'application/pdf') return 'pdf'
    if (contentType.startsWith('video/')) return 'video'
    if (contentType.startsWith('audio/')) return 'audio'
    if (contentType.startsWith('text/plain')) return 'text'
    return kindOf(name)
}

/** Still on its way to being checked: what "Đang tải lên x/y" waits for (C-12). */
export const isUploading = (state: string) => state === 'waiting' || state === 'uploading' || state === 'checking'

/** Why a file chosen never went into the tray (S-CHAT-04 › Toast). */
export type Refusal = 'too-large' | 'unsupported' | 'empty'

export interface Sorted {
    /** In the order chosen, as many as the tray still has room for. */
    taken: File[]
    refused: Array<{ file: File; why: Refusal }>
    /** Over 10 in the tray: the first ones are taken, these left out. */
    leftOut: number
}

/**
 * Which of the files chosen, dropped or pasted go into a tray that holds
 * `inTray` already (D-93): not empty, at most 25 MB, of a type sent; then the
 * first that fit in 10.
 */
export function sortChosen(files: File[], inTray: number): Sorted {
    const refused: Sorted['refused'] = []
    const fine: File[] = []
    for (const file of files) {
        if (file.size === 0) refused.push({ file, why: 'empty' })
        else if (file.size > ATTACHMENT_MAX_BYTES) refused.push({ file, why: 'too-large' })
        else if (!kindOf(file.name)) refused.push({ file, why: 'unsupported' })
        else fine.push(file)
    }
    const room = Math.max(0, ATTACHMENTS_PER_MESSAGE - inTray)
    return { taken: fine.slice(0, room), refused, leftOut: Math.max(0, fine.length - room) }
}

/**
 * A file's size as the chat shows it (C-10 › Cỡ tệp): "640 KB", "1,8 MB"
 * with one decimal and the locale's separator; under 1 KB is "1 KB".
 */
export function fileSize(bytes: number, locale: string): string {
    const kb = bytes / 1024
    if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`
    const mb = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(kb / 1024)
    return `${mb} MB`
}

/**
 * A name in two parts for a line that cuts it in the middle (C-10): the end
 * (up to 10 characters, the type with it) never shrinks, the start does.
 */
export function middleSplit(name: string): { head: string; tail: string } {
    const characters = [...name]
    const cut = characters.length - Math.min(10, Math.floor(characters.length / 2))
    return { head: characters.slice(0, cut).join(''), tail: characters.slice(cut).join('') }
}

/**
 * A long name cut in the middle, the end kept (C-41, C-10): "bao-cao-cu…ky.pdf".
 * `max` counts characters as people do (an emoji, a letter with its accents).
 */
export function middleOut(name: string, max: number): string {
    const characters = [...name]
    if (characters.length <= max) return name
    const keep = max - 1
    const tail = Math.ceil(keep / 2)
    return `${characters.slice(0, keep - tail).join('')}…${characters.slice(-tail).join('')}`
}
