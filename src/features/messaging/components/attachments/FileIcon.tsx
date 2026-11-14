import { File, FileArchive, FileCode, FileText, Film, Music, Presentation, Sheet, type LucideProps } from 'lucide-react'
import type { FileKind } from '../../lib/attachment-rules'

/** A file's icon by its kind (C-10 › Thẻ tệp): `file-text` pdf / doc, `sheet` xls, `presentation` ppt… */
export function FileIcon({ kind, ...props }: { kind: FileKind | null } & LucideProps) {
    const Icon =
        kind === 'pdf' || kind === 'document'
            ? FileText
            : kind === 'sheet'
              ? Sheet
              : kind === 'slides'
                ? Presentation
                : kind === 'archive'
                  ? FileArchive
                  : kind === 'text'
                    ? FileCode
                    : kind === 'video'
                      ? Film
                      : kind === 'audio'
                        ? Music
                        : File
    return <Icon aria-hidden='true' {...props} />
}
