import { forwardRef, type KeyboardEvent } from 'react'
import { Clock3, FileX, RotateCw, WifiOff, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Upload } from '../../attachment-tray.store'
import type { TFunction } from 'i18next'
import { extensionOf, fileSize, middleOut } from '../../lib/attachment-rules'
import { FileIcon } from './FileIcon'
import { UploadRing } from './UploadRing'

/**
 * One file in the composer's tray (C-41), 120 × 120: an image shows its
 * picture from this device at once, any other file its icon, name cut in the
 * middle and size. Over it, while not done: waiting, the ring and percent,
 * "Chờ có mạng" (the browser offline: it goes on its own once back), "Thử
 * lại" (failed: clicking the tile tries again), or "Không gửi được"
 * (refused for its content: only taken out). `x` takes it out; shown on hover
 * and focus, always on a tile in error. Keys (C-41): Delete / Backspace take
 * it out, Enter tries a failed one again; ← / → move along the tray.
 */
export const AttachmentTile = forwardRef<
    HTMLButtonElement,
    {
        upload: Upload
        tabIndex: number
        onRemove: () => void
        onRetry: () => void
        onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
    }
>(function AttachmentTile({ upload, tabIndex, onRemove, onRetry, onKeyDown }, ref) {
    const { t, i18n } = useTranslation('messaging')
    const { file, state } = upload
    const size = fileSize(file.size, i18n.language)
    const percent = Math.round(upload.progress * 100)
    const error = state === 'failed' || state === 'rejected'
    const covered = state !== 'done'
    // "cong-thuc.png không phải tệp ảnh thật nên không gửi được" (S-CHAT-04 › content-mismatch).
    const reason = state === 'rejected' ? refusalText(upload, t) : null
    const reasonId = `tile-why-${upload.id}`

    const said =
        state === 'waiting'
            ? t('attach.waiting')
            : state === 'uploading' || state === 'checking'
              ? t('attach.progress', { percent })
              : state === 'failed'
                ? t('attach.retry')
                : state === 'rejected'
                  ? t('attach.rejected')
                  : state === 'offline'
                    ? t('attach.offline')
                    : t('attach.uploaded')

    const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault()
            onRemove()
        } else if (event.key === 'Enter' && state === 'failed') {
            event.preventDefault()
            onRetry()
        } else {
            onKeyDown(event)
        }
    }

    return (
        <div
            role='listitem'
            style={TILE}
            className={cn(
                // `group`, not a named one: no ancestor of the composer is one, and the classes are the chat's own.
                'group relative shrink-0 overflow-hidden rounded-input border border-border bg-surface-2',
                error && 'border-2 border-danger'
            )}
        >
            <WithTooltip label={reason ?? `${file.name} · ${size}`}>
                {/* The tile itself: one stop of the tray, its keys; a click tries a failed one again (C-41). */}
                <button
                    ref={ref}
                    type='button'
                    tabIndex={tabIndex}
                    aria-label={`${file.name}, ${said}`}
                    aria-describedby={reason ? reasonId : undefined}
                    onKeyDown={keyDown}
                    onClick={state === 'failed' ? onRetry : undefined}
                    className={cn(
                        'absolute inset-0 rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                        state !== 'failed' && 'cursor-default'
                    )}
                />
            </WithTooltip>
            {reason ? (
                <span id={reasonId} className='sr-only'>
                    {reason}
                </span>
            ) : null}
            <div className='pointer-events-none size-full'>
                {upload.preview ? (
                    <img
                        src={upload.preview}
                        alt=''
                        className='size-full object-cover'
                        // Named as an image but not one (refused, D-93): no broken picture behind the overlay.
                        onError={(event) => {
                            event.currentTarget.style.visibility = 'hidden'
                        }}
                    />
                ) : covered ? null : (
                    <FileFace upload={upload} size={size} />
                )}
                {covered ? (
                    <div
                        className='absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center'
                        // Two layers of scrim (≈ bg 84%): one alone leaves white text hard to read on a light photo (C-41).
                        style={SCRIM_TWICE}
                    >
                        {state === 'waiting' ? (
                            <Clock3 className='size-5 text-text-primary' aria-hidden='true' />
                        ) : state === 'failed' ? (
                            <RotateCw className='size-5 text-text-primary' aria-hidden='true' />
                        ) : state === 'rejected' ? (
                            <FileX className='size-5 text-text-primary' aria-hidden='true' />
                        ) : state === 'offline' ? (
                            <WifiOff className='size-5 text-text-primary' aria-hidden='true' />
                        ) : (
                            <UploadRing progress={upload.progress} />
                        )}
                        <span className='text-label font-semibold text-text-primary'>
                            {state === 'uploading' || state === 'checking' ? `${percent}%` : said}
                        </span>
                        {upload.preview ? null : (
                            <span className='w-full truncate text-micro text-text-secondary'>
                                {middleOut(file.name, 14)}
                            </span>
                        )}
                    </div>
                ) : null}
            </div>
            <button
                type='button'
                tabIndex={-1}
                aria-label={t('attach.remove', { name: file.name })}
                onClick={(event) => {
                    event.stopPropagation()
                    onRemove()
                }}
                className={cn(
                    'absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-surface-3 text-text-primary',
                    // Always shown on a tile in error (C-41).
                    !error && 'opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100'
                )}
            >
                <X className='size-3.5' aria-hidden='true' />
            </button>
        </div>
    )
})

/** 120 × 120 (C-41): a one-off size, inline rather than a class. */
const TILE = { width: 120, height: 120 }

/** Why a file can never go, as the tile's Tooltip says it (S-CHAT-04). */
function refusalText({ file, kind, refusal }: Upload, t: TFunction<'messaging'>): string {
    if (refusal === 'not-allowed') return t('attach.notAllowed')
    if (refusal === 'too-large') return t('attach.tooLargeOne', { name: file.name })
    if (refusal === 'type') return t('attach.unsupportedType', { extension: extensionOf(file.name) })
    return t('attach.rejectedWhy', { name: file.name, kind: t(`attach.kind.${kind}`) })
}

const SCRIM_TWICE = { background: 'linear-gradient(var(--scrim), var(--scrim)), var(--scrim)' }

/** A file that is not an image, done: its icon, name cut in the middle, size. */
function FileFace({ upload, size }: { upload: Upload; size: string }) {
    return (
        <div className='flex size-full flex-col items-center justify-center gap-1 px-2 text-center'>
            <FileIcon kind={upload.kind} className='size-8 text-text-secondary' />
            <span className='w-full truncate text-label font-medium text-text-primary'>
                {middleOut(upload.file.name, 14)}
            </span>
            <span className='text-label text-text-tertiary'>{size}</span>
        </div>
    )
}
