import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CircleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import type { Upload } from '../../attachment-tray.store'
import { isUploading } from '../../lib/attachment-rules'
import { AttachmentTile } from './AttachmentTile'

/**
 * The files going with the next message (C-12 › AttachmentTray): tiles of
 * 120 in a row that scrolls sideways, inside the composer above the box, and
 * "Đang tải lên 2/4" while some are not done; after Enter with a file in
 * error, "Gỡ hoặc thử lại tệp lỗi để gửi" in its place (`danger`). One Tab
 * stop before the box; ← / → move between tiles; a tile taken out leaves the
 * focus on the one in its place, or on the box when none is left. Each file
 * done is said politely to screen readers.
 */
export function AttachmentTray({
    uploads,
    done,
    held,
    onRemove,
    onRetry,
    onEmptied
}: {
    uploads: Upload[]
    done: number
    /** Enter was pressed with a file in error. */
    held: boolean
    onRemove: (id: string) => void
    onRetry: (id: string) => void
    /** The last file was taken out from the keyboard: the focus goes back to the box. */
    onEmptied: () => void
}) {
    const { t } = useTranslation('messaging')
    const tiles = useRef<Array<HTMLButtonElement | null>>([])
    const [current, setCurrent] = useState(0)
    const said = useSaidDone(uploads)
    const at = Math.min(current, uploads.length - 1)

    const move = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
        const next = index + step
        if (!step || next < 0 || next >= uploads.length) return
        event.preventDefault()
        setCurrent(next)
        tiles.current[next]?.focus()
    }
    /** Out of the tray; the focus stays in it, on the tile that takes its place. */
    const remove = (index: number, id: string) => {
        const focused = tiles.current[index] === document.activeElement
        const next = Math.min(index, uploads.length - 2)
        onRemove(id)
        setCurrent(Math.max(0, next))
        if (!focused) return
        if (next < 0) onEmptied()
        else requestAnimationFrame(() => tiles.current[next]?.focus())
    }

    return (
        <div className='pt-3'>
            <div role='list' aria-label={t('attach.tray')} className='flex gap-2 pb-1' style={SIDEWAYS}>
                {uploads.map((upload, index) => (
                    <AttachmentTile
                        key={upload.id}
                        ref={(node) => {
                            tiles.current[index] = node
                        }}
                        upload={upload}
                        tabIndex={index === at ? 0 : -1}
                        onRemove={() => remove(index, upload.id)}
                        onRetry={() => onRetry(upload.id)}
                        onKeyDown={move(index)}
                    />
                ))}
            </div>
            {held ? (
                <p
                    id={`tray-held-${uploads[0]?.channelId}`}
                    role='alert'
                    className='flex items-center gap-1.5 pt-1 text-label text-danger'
                >
                    <CircleAlert className='size-4 shrink-0' aria-hidden='true' />
                    {t('attach.fixFirst')}
                </p>
            ) : uploads.some((upload) => isUploading(upload.state)) ? (
                <p className='pt-1 text-label text-text-secondary'>
                    {t('attach.uploading', { done, total: uploads.length })}
                </p>
            ) : null}
            <p className='sr-only' aria-live='polite'>
                {said}
            </p>
        </div>
    )
}

/** The tray scrolls sideways (C-12): inline, the one place it does. */
const SIDEWAYS = { overflowX: 'auto' } as const

/** "Đã tải lên cau4-3.jpg" when a file is done (C-41 › screen readers). */
function useSaidDone(uploads: Upload[]): string {
    const { t } = useTranslation('messaging')
    const before = useRef(new Map<string, Upload['state']>())
    const [said, setSaid] = useState('')
    useEffect(() => {
        const finished = uploads.find((upload) => upload.state === 'done' && before.current.get(upload.id) !== 'done')
        before.current = new Map(uploads.map((upload) => [upload.id, upload.state]))
        if (finished) setSaid(t('attach.uploadedName', { name: finished.file.name }))
    }, [uploads, t])
    return said
}
