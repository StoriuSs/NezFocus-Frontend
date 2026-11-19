import { useEffect, useRef, useState } from 'react'
import { Loader2, Maximize2, Minimize2, MonitorUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import type { Track } from 'livekit-client'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { fitted } from '../lib/share'

/** A screen's shape until its picture says (16:9, as most screens). */
const FALLBACK = { width: 16, height: 9 }

/**
 * The stage when a screen is shared (C-31 StageView, S-ROOM-07): a frame of
 * the page's `bg` filling what is left between the strip and the controls,
 * 24 from the sides (in line with the strip), its padding 16. In it, for
 * the one sharing, the card "You're sharing your screen" (C-31 `self`,
 * D-101: no picture of one's own screen); for everyone else the screen.
 */
export function StageView({
    track,
    name,
    self,
    onStop
}: {
    /** The shared screen's picture, once LiveKit has it. */
    track?: Track
    /** Who shares it. */
    name: string
    self: boolean
    /** "Stop sharing" on the card. */
    onStop: () => void
}) {
    return (
        <div className='flex min-h-0 flex-1 rounded-button bg-bg p-4' style={{ margin: '16px 24px' }}>
            {self ? <SelfCard onStop={onStop} /> : <Screen track={track} name={name} />}
        </div>
    )
}

/** C-31 `self`: in the middle of the frame, `surface-1`, a `border` rule, padding 32. */
function SelfCard({ onStop }: { onStop: () => void }) {
    const { t } = useTranslation('voice')
    return (
        <div
            className='m-auto flex flex-col items-center gap-3 rounded-button border bg-surface-1 p-8 text-center'
            style={{ width: 420, maxWidth: '100%' }}
        >
            <MonitorUp className='size-8 text-text-secondary' aria-hidden='true' />
            <p className='text-headline font-semibold text-text-primary'>{t('stage.selfTitle')}</p>
            <p className='text-body-sm text-text-secondary'>{t('stage.selfBody')}</p>
            <Button variant='secondary' size='sm' style={{ marginTop: 8 }} onClick={onStop}>
                {t('controls.stopShare')}
            </Button>
        </div>
    )
}

/**
 * Someone's screen (C-31 `viewing`): whole, in the middle of the frame, its
 * shape kept (`rounded.button`, a `border` rule); the label at its bottom
 * left; Full screen at its top right on hover or focus. Until the picture
 * comes: `connecting`. The screen is a group named after whose it is; its
 * one keyboard stop is Full screen (Enter), shown while focused; Esc (the
 * browser's) comes back.
 */
function Screen({ track, name }: { track?: Track; name: string }) {
    const { t } = useTranslation('voice')
    const frame = useRef<HTMLDivElement>(null)
    const area = useRef<HTMLDivElement>(null)
    const video = useRef<HTMLVideoElement>(null)
    const [room, setRoom] = useState({ width: 0, height: 0 })
    const [shape, setShape] = useState(FALLBACK)
    const [playing, setPlaying] = useState(false)
    const [full, setFull] = useState(false)

    useEffect(() => {
        const element = area.current
        if (!element) return
        const measure = () => setRoom({ width: element.clientWidth, height: element.clientHeight })
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        const element = video.current
        // A new picture, or none (unsubscribed, the link coming back): `connecting` until it plays.
        setPlaying(false)
        if (!track || !element) return
        track.attach(element)
        return () => {
            track.detach(element)
        }
    }, [track])

    useEffect(() => {
        const changed = () => setFull(document.fullscreenElement === frame.current && frame.current !== null)
        document.addEventListener('fullscreenchange', changed)
        return () => document.removeEventListener('fullscreenchange', changed)
    }, [])

    const toggleFull = () => {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
        else void frame.current?.requestFullscreen().catch(() => undefined)
    }
    const onShape = () => {
        const element = video.current
        if (element?.videoWidth && element.videoHeight)
            setShape({ width: element.videoWidth, height: element.videoHeight })
    }
    const box = fitted(room, shape)
    const label = t('stage.screenOf', { name })
    const fullLabel = t(full ? 'stage.exitFullscreen' : 'stage.fullscreen')
    return (
        <div ref={frame} className='flex min-h-0 flex-1 bg-bg' style={full ? { padding: 16 } : undefined}>
            <div ref={area} className='relative min-h-0 flex-1'>
                <div
                    role='group'
                    aria-label={label}
                    aria-busy={!playing || undefined}
                    className='group absolute inset-0 m-auto overflow-hidden rounded-button border bg-surface-2'
                    style={box}
                >
                    <video
                        ref={video}
                        autoPlay
                        muted
                        playsInline
                        aria-hidden='true'
                        className='size-full'
                        style={{ objectFit: 'contain' }}
                        onLoadedMetadata={onShape}
                        onResize={onShape}
                        onPlaying={() => setPlaying(true)}
                    />
                    {playing ? null : (
                        <div className='absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-2 text-body-sm text-text-secondary'>
                            <Loader2 className='size-6 animate-spin' aria-hidden='true' />
                            {t('stage.loading', { name })}
                        </div>
                    )}
                    <span
                        className='absolute left-3 flex items-center gap-1.5 rounded-input bg-scrim px-2 py-1 text-label font-semibold text-text-primary'
                        style={{ bottom: 12, maxWidth: '80%' }}
                    >
                        <MonitorUp className='size-3.5 shrink-0' aria-hidden='true' />
                        <span className='truncate'>{label}</span>
                    </span>
                    <WithTooltip label={fullLabel}>
                        <IconButton
                            label={fullLabel}
                            onClick={toggleFull}
                            className='absolute right-3 top-3 bg-scrim text-text-primary opacity-0 hover:bg-surface-3 group-focus-within:opacity-100 group-hover:opacity-100'
                        >
                            {full ? <Minimize2 /> : <Maximize2 />}
                        </IconButton>
                    </WithTooltip>
                </div>
            </div>
        </div>
    )
}
