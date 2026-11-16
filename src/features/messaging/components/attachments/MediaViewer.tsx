import { useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { Avatar, AvatarFallback, AvatarImage, AvatarInitial } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogCover, DialogTitle } from '@/components/ui/dialog'
import { IconButton } from '@/components/ui/icon-button'
import { Skeleton } from '@/components/ui/skeleton'
import { WithTooltip } from '@/components/ui/tooltip'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { useAttachmentLinks, useFreshLinks } from '../../api/useAttachmentLinks'
import { fileSize } from '../../lib/attachment-rules'
import { openInNewTab, startDownload } from '../../lib/download'
import { timeWithDay } from '../../lib/message-time'
import type { Attachment, Message } from '../../types'

/**
 * The viewer of a message's images and PDFs (C-42 MediaViewer; S-CHAT-04
 * `image-viewer`, `file-viewer`), over the whole window on three layers of
 * scrim. The top bar, 56: who sent it (their avatar, or `file-text` for a
 * PDF), when, the file's name and size; "Tải về", "Mở tab mới" (icons alone
 * below 1024), close. An image fits what is left (the window less 56 above,
 * 40 below and 80 each side for ‹ ›; never past its own size), ‹ › and "2 /
 * 3" when the message has more than one, ← / → too. A PDF: the browser's
 * viewer in a frame at most 960 wide, its links asked for anew first; a
 * browser that shows no PDF: "Trình duyệt không xem được tệp này" and
 * "Tải về". Closes with x, Esc, or a click on the scrim; the focus goes back
 * to what opened it. No URL of its own.
 */
export default function MediaViewer({
    open,
    message,
    file,
    now,
    timeZone,
    onMove,
    onClose,
    onClosed
}: {
    /** Closing, it fades out first (`onClosed` after). */
    open: boolean
    message: Message
    /** The file shown: one of the message's images, or a PDF. */
    file: Attachment
    now: Date
    timeZone?: string
    /** ‹ › and ← / →: another image of the message. */
    onMove: (fileId: string) => void
    onClose: () => void
    /** Faded out: the focus goes back to what opened it. */
    onClosed: () => void
}) {
    const { t, i18n } = useTranslation('messaging')
    const wide = useMediaQuery('(min-width: 1024px)')
    const { download, openInTab } = useAttachmentLinks(file)
    const pdf = file.contentType === 'application/pdf'
    const images = pdf ? [] : message.attachments.filter((one) => one.thumbnailUrl !== null)
    const at = images.findIndex((one) => one.id === file.id)
    const author = message.author
    const name = author?.displayName ?? author?.username ?? t('message.deletedAccount')
    const meta = `· ${timeWithDay(new Date(message.createdAt), now, timeZone, t)} · ${file.filename} · ${fileSize(file.size, i18n.language)}`
    const label = t(pdf ? 'viewer.file' : 'viewer.image', { name: file.filename, author: name })

    const previous = useRef<HTMLButtonElement>(null)
    const next = useRef<HTMLButtonElement>(null)
    const step = (by: number) => {
        const to = images[at + by]
        if (!to) return
        onMove(to.id)
        // At the first or the last image its button goes off: the focus goes to the other, keys still working.
        const end = at + by === 0 ? previous.current : at + by === images.length - 1 ? next.current : null
        if (end && end === document.activeElement) (end === next.current ? previous : next).current?.focus()
    }
    const keys = (event: KeyboardEvent) => {
        if (event.key === 'ArrowLeft') step(-1)
        else if (event.key === 'ArrowRight') step(1)
    }
    const save = () => void download(startDownload)

    return (
        <Dialog open={open} onOpenChange={(opened) => !opened && onClose()}>
            <DialogCover
                aria-describedby={undefined}
                overlayStyle={SCRIM_THRICE}
                onKeyDown={keys}
                onCloseAutoFocus={(event) => {
                    event.preventDefault()
                    onClosed()
                }}
            >
                <DialogTitle className='sr-only'>{label}</DialogTitle>
                <div className='flex shrink-0 items-center gap-2' style={BAR}>
                    {pdf ? (
                        <FileText className='size-6 shrink-0 text-text-secondary' aria-hidden='true' />
                    ) : (
                        <Avatar className='size-6'>
                            <AvatarImage src={author?.avatarUrl ?? undefined} alt='' className='object-cover' />
                            <AvatarFallback className='bg-surface-3 text-label font-semibold text-text-primary'>
                                <AvatarInitial name={author?.displayName ?? author?.username} />
                            </AvatarFallback>
                        </Avatar>
                    )}
                    <p className='flex min-w-0 flex-1 gap-1 text-body-sm'>
                        <span className='shrink-0 font-semibold text-text-primary'>{name}</span>
                        <span className='truncate text-text-secondary'>{meta}</span>
                    </p>
                    <BarAction wide={wide} label={t('attach.download')} icon={<Download />} onClick={save} />
                    <BarAction
                        wide={wide}
                        label={t('viewer.newTab')}
                        icon={<ExternalLink />}
                        onClick={() => void openInTab(openInNewTab)}
                    />
                    <WithTooltip label={t('viewer.close')}>
                        <IconButton label={t('viewer.close')} onClick={onClose} className='text-text-primary'>
                            <X aria-hidden='true' />
                        </IconButton>
                    </WithTooltip>
                </div>
                <div className='relative flex min-h-0 flex-1 items-center justify-center'>
                    <Backdrop onClose={onClose} />
                    {pdf ? (
                        <PdfFrame key={file.id} file={file} label={label} onDownload={save} />
                    ) : (
                        <ViewerImage key={file.id} file={file} wide={wide} />
                    )}
                    {images.length > 1 ? (
                        <>
                            <Side
                                buttonRef={previous}
                                label={t('viewer.previous')}
                                disabled={at <= 0}
                                onClick={() => step(-1)}
                                left
                            >
                                <ChevronLeft aria-hidden='true' />
                            </Side>
                            <Side
                                buttonRef={next}
                                label={t('viewer.next')}
                                disabled={at >= images.length - 1}
                                onClick={() => step(1)}
                            >
                                <ChevronRight aria-hidden='true' />
                            </Side>
                        </>
                    ) : null}
                </div>
                <div className='relative flex shrink-0 items-center justify-center' style={FOOT}>
                    <Backdrop onClose={onClose} />
                    {images.length > 1 ? (
                        <p className='relative text-label text-text-secondary'>
                            {t('viewer.count', { at: at + 1, total: images.length })}
                        </p>
                    ) : null}
                </div>
            </DialogCover>
        </Dialog>
    )
}

/**
 * The image itself, fitted: the window less the bar (56), the line under it
 * (40) and room for ‹ › (80 each side; below 1024 they lie over its edges).
 * Its place keeps its shape and pulses while it loads (Skeleton); links that
 * ended are asked for again once, and one still failing keeps its
 * `surface-2` place.
 */
function ViewerImage({ file: given, wide }: { file: Attachment; wide: boolean }) {
    const { t } = useTranslation('messaging')
    const { file, broken, renew } = useAttachmentLinks(given)
    const [loaded, setLoaded] = useState(false)
    const room = { width: `calc(100vw - ${wide ? 160 : 32}px)`, height: 'calc(100vh - 96px)' }
    // Its own size and shape (`width` / `height`), within the room: CSS keeps the shape, never grows it.
    const size = {
        maxWidth: room.width,
        maxHeight: room.height,
        width: 'auto',
        height: 'auto',
        objectFit: 'contain'
    } as const
    if (broken)
        return (
            <div
                role='img'
                aria-label={t('attach.image', { name: file.filename })}
                className='relative rounded-button bg-surface-2'
                style={{
                    aspectRatio: `${file.width ?? 4} / ${file.height ?? 3}`,
                    width: `min(${file.width ?? 480}px, ${room.width}, ${room.height} * ${(file.width ?? 4) / (file.height ?? 3)})`
                }}
            />
        )
    return (
        <img
            src={file.url}
            alt={t('attach.image', { name: file.filename })}
            onError={renew}
            onLoad={() => setLoaded(true)}
            width={file.width ?? undefined}
            height={file.height ?? undefined}
            className={cn('relative block bg-surface-2', !loaded && 'animate-pulse')}
            style={size}
        />
    )
}

/**
 * A PDF in the browser's own viewer, its links new (they may have ended while
 * the page was open); a browser that shows no PDF says so, with "Tải về".
 */
function PdfFrame({ file, label, onDownload }: { file: Attachment; label: string; onDownload: () => void }) {
    const { t } = useTranslation('messaging')
    const fresh = useFreshLinks(file)
    const shows = navigator.pdfViewerEnabled !== false
    return (
        <div
            className='relative flex size-full flex-col items-center justify-center overflow-hidden rounded-button bg-surface-1'
            style={FRAME}
        >
            {!shows ? (
                <div className='flex flex-col items-center gap-3 text-center'>
                    <FileText className='size-12 text-text-secondary' aria-hidden='true' />
                    <p className='text-body-sm text-text-primary'>{t('viewer.noPdf')}</p>
                    <Button variant='secondary' onClick={onDownload}>
                        {t('attach.download')}
                    </Button>
                </div>
            ) : fresh ? (
                <iframe src={fresh.url} title={label} className='size-full' />
            ) : (
                <Skeleton className='size-full' />
            )}
        </div>
    )
}

/**
 * The scrim around what is shown: a click there closes (C-42). Under the
 * image or the frame, out of the Tab order and hidden from screen readers,
 * who close with x or Esc.
 */
function Backdrop({ onClose }: { onClose: () => void }) {
    return (
        <button
            type='button'
            tabIndex={-1}
            aria-hidden='true'
            className='absolute inset-0 cursor-default'
            onClick={onClose}
        />
    )
}

/** "Tải về" and "Mở tab mới": a text button from 1024 up, an icon and its Tooltip below (S-CHAT-04 › 768). */
function BarAction({
    wide,
    label,
    icon,
    onClick
}: {
    wide: boolean
    label: string
    icon: React.ReactNode
    onClick: () => void
}) {
    if (wide)
        return (
            <Button variant='text' size='sm' onClick={onClick}>
                {icon}
                {label}
            </Button>
        )
    return (
        <WithTooltip label={label}>
            <IconButton label={label} onClick={onClick}>
                {icon}
            </IconButton>
        </WithTooltip>
    )
}

/** ‹ or ›: 40, round, `surface-2`, halfway down each side; disabled at the first and the last image. */
function Side({
    buttonRef,
    label,
    disabled,
    onClick,
    left = false,
    children
}: {
    buttonRef: Ref<HTMLButtonElement>
    label: string
    disabled: boolean
    onClick: () => void
    left?: boolean
    children: React.ReactNode
}) {
    return (
        <WithTooltip label={label}>
            <IconButton
                ref={buttonRef}
                label={label}
                disabled={disabled}
                onClick={onClick}
                className='bg-surface-2 text-text-primary'
                style={{ ...SIDE, [left ? 'left' : 'right']: 20 }}
            >
                {children}
            </IconButton>
        </WithTooltip>
    )
}

/** Three layers of scrim (≈ `bg` 94%), as the frame has them. */
const SCRIM_THRICE = {
    background: 'linear-gradient(var(--scrim), var(--scrim)), linear-gradient(var(--scrim), var(--scrim)), var(--scrim)'
}
const BAR = { height: 56, padding: '0 16px' }
const FOOT = { height: 40 }
const FRAME = { maxWidth: 960 }
const SIDE = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 40,
    height: 40,
    borderRadius: 9999
} as const
