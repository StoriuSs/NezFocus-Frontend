import { useRef, useState, type CSSProperties } from 'react'
import { FileX, RotateCw, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useShallow } from 'zustand/react/shallow'
import '@/i18n/messaging'
import { useAttachmentLinks } from '../../api/useAttachmentLinks'
import { useUploads, type Upload } from '../../attachment-tray.store'
import { isUploading, kindOfContent } from '../../lib/attachment-rules'
import { startDownload } from '../../lib/download'
import type { Attachment } from '../../types'
import { FileCard } from './FileCard'
import { AudioCard, VideoPlayer } from './MediaPlayers'
import { UploadRing } from './UploadRing'

/** Opens a file of the message in the viewer (C-42); `from`, where the focus goes back once it closes. */
export type OpenFile = (file: Attachment, from: HTMLElement) => void

/**
 * A message's files (C-10 › Tệp trong tin), under its text, 8 apart: the
 * images first as a grid, then videos, sounds, and the other files as cards,
 * each group in the order sent. One image keeps its shape within 360 × 320
 * (never past its own size; a very flat one at least 80 high, cut in the
 * middle); 2-4 make a grid of 2 columns of 180 squares, 5-10 of 3 columns of
 * 120, 4 apart. An image that would not decode is a card (owner,
 * 14/11/2026). An image, and a PDF's card, open in the viewer (`onOpen`).
 */
export function MessageAttachments({ files, onOpen }: { files: Attachment[]; onOpen?: OpenFile }) {
    const kind = (file: Attachment) => kindOfContent(file.contentType, file.filename)
    const images = files.filter((file) => file.thumbnailUrl !== null)
    const rest = files.filter((file) => file.thumbnailUrl === null)
    const videos = rest.filter((file) => kind(file) === 'video')
    const sounds = rest.filter((file) => kind(file) === 'audio')
    const others = rest.filter((file) => kind(file) !== 'video' && kind(file) !== 'audio')
    return (
        <div className='mt-2 flex flex-col gap-2'>
            {images.length ? (
                <Grid count={images.length}>
                    {images.map((file) => (
                        <SavedImage key={file.id} file={file} count={images.length} onOpen={onOpen} />
                    ))}
                </Grid>
            ) : null}
            {videos.map((file) => (
                <VideoPlayer key={file.id} file={file} />
            ))}
            {sounds.map((file) => (
                <AudioCard key={file.id} file={file} />
            ))}
            {others.map((file) => (
                <SavedCard key={file.id} file={file} onOpen={kind(file) === 'pdf' ? onOpen : undefined} />
            ))}
        </div>
    )
}

/**
 * The files of a message on its way (C-10 `sending` with files): pictures
 * from this device, a ring of 32 on each not uploaded yet, and "Đang tải lên
 * 3/4" under them. A file that failed or was refused says so on itself, the
 * message being `failed` (D-93).
 */
export function OutgoingAttachments({ ids }: { ids: string[] }) {
    const { t } = useTranslation('messaging')
    const uploads = useUploads(useShallow((state) => ids.flatMap((id) => state.uploads[id] ?? [])))
    const images = uploads.filter((upload) => upload.preview)
    const others = uploads.filter((upload) => !upload.preview)
    const done = uploads.filter((upload) => upload.state === 'done').length
    return (
        <div className='mt-2 flex flex-col gap-2'>
            {images.length ? (
                <Grid count={images.length}>
                    {images.map((upload) => (
                        <div
                            key={upload.id}
                            className='relative overflow-hidden rounded-button'
                            style={cell(images.length)}
                        >
                            <img
                                src={upload.preview!}
                                alt=''
                                className='block size-full object-cover'
                                // One image keeps its own shape (C-10); its size is not known until saved.
                                style={images.length === 1 ? ALONE : undefined}
                            />
                            {upload.state === 'done' ? null : (
                                <div className='absolute inset-0 flex items-center justify-center' style={SCRIM}>
                                    <UploadMark upload={upload} />
                                </div>
                            )}
                        </div>
                    ))}
                </Grid>
            ) : null}
            {others.map((upload) => (
                <FileCard
                    key={upload.id}
                    name={upload.file.name}
                    size={upload.file.size}
                    kind={upload.kind}
                    progress={upload.state === 'done' ? undefined : upload.progress}
                    mark={
                        upload.state === 'failed' || upload.state === 'rejected' || upload.state === 'offline' ? (
                            <UploadMark upload={upload} />
                        ) : undefined
                    }
                />
            ))}
            {uploads.some((upload) => isUploading(upload.state)) ? (
                <p className='text-label text-text-secondary'>
                    {t('attach.uploading', { done, total: uploads.length })}
                </p>
            ) : null}
        </div>
    )
}

/** Where a file of a message on its way is: the ring, waiting for the network, or why it did not go (C-41's marks). */
function UploadMark({ upload }: { upload: Upload }) {
    const { t } = useTranslation('messaging')
    if (upload.state === 'offline')
        return (
            <span className='flex items-center gap-1.5 text-label font-semibold text-text-primary'>
                <WifiOff className='size-4' aria-hidden='true' />
                <span>{t('attach.offline')}</span>
            </span>
        )
    if (upload.state !== 'failed' && upload.state !== 'rejected') return <UploadRing progress={upload.progress} />
    const Icon = upload.state === 'failed' ? RotateCw : FileX
    return (
        <span className='flex items-center gap-1.5 text-label font-semibold text-danger'>
            <Icon className='size-4' aria-hidden='true' />
            <span>{t(upload.state === 'failed' ? 'attach.failed' : 'attach.rejected')}</span>
        </span>
    )
}

/** One image on its way: its own shape within 360 × 320, as it will show once saved. */
const ALONE: CSSProperties = { maxWidth: 360, maxHeight: 320, width: 'auto', height: 'auto' }

/** C-10 `sending`: the ring on `bg` 60%. */
const SCRIM: CSSProperties = { background: 'var(--scrim)' }

/** 2-4 images: 180 squares; 5-10: 120 (C-10). One image sizes itself. */
const cell = (count: number): CSSProperties | undefined =>
    count === 1 ? undefined : count <= 4 ? { width: 180, height: 180 } : { width: 120, height: 120 }

function Grid({ count, children }: { count: number; children: React.ReactNode }) {
    if (count === 1) return <div className='flex'>{children}</div>
    return (
        <div className='grid w-fit gap-1' style={{ gridTemplateColumns: `repeat(${count <= 4 ? 2 : 3}, auto)` }}>
            {children}
        </div>
    )
}

/**
 * An image of a saved message: its thumbnail, its place kept by its size
 * before it loads; links that ended are asked for again once, and an image
 * that still fails keeps its `surface-2` placeholder, never a broken picture.
 * A GIF moves in the message, from the file itself; with reduced motion it
 * stays still (its thumbnail, the first frame) until hovered (C-10).
 */
function SavedImage({ file: given, count, onOpen }: { file: Attachment; count: number; onOpen?: OpenFile }) {
    const { t } = useTranslation('messaging')
    const { file, broken, renew } = useAttachmentLinks(given)
    const still = useMediaQuery('(prefers-reduced-motion: reduce)')
    const [hovered, setHovered] = useState(false)
    const moving = file.contentType === 'image/gif' && (!still || hovered)
    const style = count === 1 ? fitted(file) : cell(count)
    if (broken)
        return (
            <div
                role='img'
                aria-label={t('attach.image', { name: file.filename })}
                className='rounded-button bg-surface-2'
                style={style}
            />
        )
    const image = (
        <img
            src={moving ? file.url : (file.thumbnailUrl ?? file.url)}
            alt={t('attach.image', { name: file.filename })}
            onError={renew}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className='block rounded-button bg-surface-2 object-cover'
            style={style}
            loading='lazy'
        />
    )
    if (!onOpen) return image
    return (
        <button
            type='button'
            onClick={(event) => onOpen(given, event.currentTarget)}
            className='block rounded-button focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
        >
            {image}
        </button>
    )
}

/**
 * One image: its own shape within 360 × 320, never past its own size (C-10);
 * shrunk below 80 high (4000 × 500), 80 high and cut in the middle
 * (S-CHAT-04 › Edge case). One smaller than that to begin with stays as it is.
 */
export function fitted({ width, height }: Pick<Attachment, 'width' | 'height'>): CSSProperties {
    if (!width || !height) return { maxWidth: 360, maxHeight: 320 }
    const scale = Math.min(1, 360 / width, 320 / height)
    return { width: Math.round(width * scale), height: Math.max(Math.round(height * scale), Math.min(80, height)) }
}

/**
 * A file shown as a card; [⤓] asks for new links first: the page may have
 * been open for hours. A PDF opens in the viewer (`onOpen`).
 */
function SavedCard({ file: given, onOpen }: { file: Attachment; onOpen?: OpenFile }) {
    const { file, download } = useAttachmentLinks(given)
    const card = useRef<HTMLButtonElement>(null)
    return (
        <FileCard
            ref={card}
            name={file.filename}
            size={file.size}
            kind={kindOfContent(file.contentType, file.filename)}
            onDownload={() => void download(startDownload)}
            onOpen={onOpen ? () => onOpen(given, card.current!) : undefined}
        />
    )
}
