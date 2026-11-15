import { useState } from 'react'
import { Download, Music } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { useAttachmentLinks } from '../../api/useAttachmentLinks'
import { fileSize } from '../../lib/attachment-rules'
import { startDownload } from '../../lib/download'
import type { Attachment } from '../../types'
import { MiddleCut } from './FileCard'

/**
 * A video in a message (C-10 › Tệp trong tin): the browser's player, 360
 * wide, as high as its shape says (at most 320; 16:9 until it knows), its
 * first frame, played in place; under it "chua-de-17-10.mp4 · 18,4 MB" and
 * [⤓]. Links that ended are asked for again once; still failing (a codec the
 * browser cannot play, HEVC say): "Trình duyệt không phát được video này ·
 * Tải về" on the frame, the line under it kept (S-CHAT-04 › Edge case).
 */
export function VideoPlayer({ file: given }: { file: Attachment }) {
    const { t, i18n } = useTranslation('messaging')
    const { file, broken, renew, download } = useAttachmentLinks(given)
    const [shape, setShape] = useState(16 / 9)
    const save = () => void download(startDownload)
    return (
        <div className='flex flex-col' style={{ width: 360, gap: 6 }}>
            <div
                className='relative overflow-hidden rounded-button bg-surface-2'
                style={{ width: 360, height: Math.min(320, Math.round(360 / shape)) }}
            >
                {broken ? (
                    <div
                        className='absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center'
                        style={{ background: 'var(--scrim)' }}
                    >
                        <p className='text-body-sm text-text-primary'>{t('attach.unplayable')}</p>
                        <Button variant='secondary' size='sm' onClick={save}>
                            {t('attach.download')}
                        </Button>
                    </div>
                ) : (
                    <video
                        src={file.url}
                        controls
                        preload='metadata'
                        aria-label={t('attach.video', { name: file.filename })}
                        className='size-full'
                        onLoadedMetadata={(event) => {
                            const { videoWidth, videoHeight } = event.currentTarget
                            if (videoWidth && videoHeight) setShape(videoWidth / videoHeight)
                        }}
                        onError={renew}
                    />
                )}
            </div>
            <div className='flex min-w-0 items-center gap-1'>
                <p className='truncate text-label text-text-tertiary'>
                    {`${file.filename} · ${fileSize(file.size, i18n.language)}`}
                </p>
                <WithTooltip label={t('attach.download')}>
                    <IconButton
                        label={t('attach.downloadName', { name: file.filename })}
                        onClick={save}
                        className='size-6'
                    >
                        {/* 24 with an icon of 14 (frame VideoPlayer): inline, as IconButton sizes its icon. */}
                        <Download aria-hidden='true' style={{ width: 14, height: 14 }} />
                    </IconButton>
                </WithTooltip>
            </div>
        </div>
    )
}

/**
 * A sound in a message (C-10 › Tệp trong tin): a card 432 wide, `music`, its
 * name cut in the middle, its size and [⤓]; under them the browser's player
 * the width of the card. Links that ended are asked for again once.
 */
export function AudioCard({ file: given }: { file: Attachment }) {
    const { t, i18n } = useTranslation('messaging')
    const { file, renew, download } = useAttachmentLinks(given)
    return (
        <div className='flex flex-col gap-2 rounded-button border border-border bg-surface-1' style={AUDIO}>
            <div className='flex items-center gap-3'>
                <Music className='size-6 shrink-0 text-text-secondary' aria-hidden='true' />
                <div className='min-w-0 flex-1'>
                    <MiddleCut name={file.filename} className='text-body-sm font-medium text-text-primary' />
                    <p className='text-label text-text-tertiary'>{fileSize(file.size, i18n.language)}</p>
                </div>
                <WithTooltip label={t('attach.download')}>
                    <IconButton
                        label={t('attach.downloadName', { name: file.filename })}
                        onClick={() => void download(startDownload)}
                    >
                        <Download aria-hidden='true' />
                    </IconButton>
                </WithTooltip>
            </div>
            <audio
                src={file.url}
                controls
                preload='metadata'
                aria-label={t('attach.audio', { name: file.filename })}
                className='w-full'
                onError={renew}
            />
        </div>
    )
}

/** 432 wide, padding 12 (C-10): one-off sizes, inline. */
const AUDIO = { maxWidth: 432, padding: 12 }
