import { forwardRef } from 'react'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { fileSize, middleSplit, type FileKind } from '../../lib/attachment-rules'
import { FileIcon } from './FileIcon'
import { UploadRing } from './UploadRing'

/**
 * A file in a message that is not shown as an image (C-10 › Thẻ tệp): 56
 * high, at most 432 wide, its icon, its name cut in the middle with the end
 * kept, its size, and [⤓] "Tải về". On its way: the ring instead of [⤓].
 * A PDF (`onOpen`): the whole card opens it in the viewer (Tooltip "Xem",
 * `surface-2` on hover), [⤓] still its own button.
 */
export const FileCard = forwardRef<
    HTMLButtonElement,
    {
        name: string
        size: number
        kind: FileKind | null
        /** On its way: how far (0 to 1); undefined once saved. */
        progress?: number
        /** On its way and failed or refused: says so in place of the ring. */
        mark?: React.ReactNode
        onDownload?: () => void
        onOpen?: () => void
    }
>(function FileCard({ name, size, kind, progress, mark, onDownload, onOpen }, ref) {
    const { t, i18n } = useTranslation('messaging')
    return (
        <div
            className={cn(
                'flex items-center gap-3 rounded-button border border-border bg-surface-1 pr-2',
                onOpen && 'relative overflow-hidden'
            )}
            style={CARD}
        >
            {onOpen ? (
                <WithTooltip label={t('attach.view')}>
                    {/* The card itself, under its face: a click anywhere but [⤓] opens the file. */}
                    <button
                        ref={ref}
                        type='button'
                        aria-label={`${t('attach.view')} ${name}`}
                        onClick={onOpen}
                        className='absolute inset-0 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'
                    />
                </WithTooltip>
            ) : null}
            <FileIcon
                kind={kind}
                className={cn('size-8 shrink-0 text-text-secondary', onOpen && 'pointer-events-none relative')}
            />
            <div className={cn('min-w-0 flex-1', onOpen && 'pointer-events-none relative')}>
                <MiddleCut name={name} className='text-body-sm font-medium text-text-primary' />
                <p className='text-label text-text-tertiary'>{fileSize(size, i18n.language)}</p>
            </div>
            {mark ? (
                mark
            ) : progress !== undefined ? (
                <UploadRing progress={progress} />
            ) : onDownload ? (
                <WithTooltip label={t('attach.download')}>
                    <IconButton
                        label={t('attach.downloadName', { name })}
                        onClick={onDownload}
                        className={onOpen ? 'relative' : undefined}
                    >
                        <Download aria-hidden='true' />
                    </IconButton>
                </WithTooltip>
            ) : null}
        </div>
    )
})

/** 56 high, at most 432 wide (C-10): one-off sizes, inline rather than classes in the stylesheet loaded first. */
const CARD = { height: 56, maxWidth: 432, paddingLeft: 12 }

/**
 * A name on one line cut in the middle, its end (the type) always shown:
 * the start shrinks with an ellipsis, the last part never does (C-10, C-41).
 */
export function MiddleCut({ name, className }: { name: string; className?: string }) {
    const { head, tail } = middleSplit(name)
    return (
        <p className={`flex min-w-0 ${className ?? ''}`} title={name}>
            <span className='truncate'>{head}</span>
            <span className='shrink-0' style={{ whiteSpace: 'pre' }}>
                {tail}
            </span>
        </p>
    )
}
