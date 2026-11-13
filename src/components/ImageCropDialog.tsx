import { useRef, useState, type RefObject } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Slider } from '@/components/ui/slider'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import getCroppedImg from '@/lib/crop-image'

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25
const MASK = 280

/**
 * The mask's corners. `round` for an avatar (S-ME-02); `squircle` for a
 * server icon (S-SRV-01 `icon-crop`), rounded as the rail rounds it:
 * `rounded.server` is 16 at 48, a third of the side.
 */
const MASK_RADIUS = { round: '50%', squircle: `${Math.round(MASK / 3)}px` } as const

export type CropMask = keyof typeof MASK_RADIUS

interface ImageCropDialogProps {
    /** An object URL of the chosen file, the caller's to release. */
    src: string
    title: string
    description: string
    confirmLabel: string
    mask: CropMask
    /** The caller is saving: buttons wait, Esc and Cancel do nothing. */
    busy?: boolean
    /**
     * Where the focus goes once the dialog has gone: opened from a file
     * chooser or a dropped file, it has no trigger of its own to go back to.
     */
    returnFocus?: RefObject<HTMLElement | null>
    /** The cropped picture, as JPEG. The caller closes the dialog when done. */
    onConfirm: (cropped: Blob) => void
    onClose: () => void
}

/**
 * Cropping a chosen picture to a square (S-ME-02 `avatar-crop`, S-SRV-01
 * `icon-crop`): a mask of 280 over it, dragged to place it, zoomed 100–300%
 * with the slider (or the wheel). At 100% the picture's shorter side fills
 * the mask, so the mask never reaches past a tall or wide picture: what it
 * shows is what is kept. The mask's ring is 2 `text-primary`; outside it,
 * `scrim`.
 */
export function ImageCropDialog({
    src,
    title,
    description,
    confirmLabel,
    mask,
    busy = false,
    returnFocus,
    onConfirm,
    onClose
}: ImageCropDialogProps) {
    const { t } = useTranslation()
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
    // The slider's zoom, 1–3; the cropper's is this times `fill`.
    const [zoom, setZoom] = useState(MIN_ZOOM)
    // The cropper's zoom at which the picture's shorter side fills the mask:
    // known once the picture has loaded, drawn to fit the frame.
    const [fill, setFill] = useState(1)
    const [cropping, setCropping] = useState(false)
    // Known once the image has loaded: confirming waits for it.
    const [area, setArea] = useState<Area | null>(null)
    /**
     * The last crop, so confirming the same area again gives the same Blob:
     * idempotency keys follow the payload, and a Blob only equals itself.
     */
    const lastCrop = useRef<{ area: string; blob: Blob } | null>(null)
    const waiting = cropping || busy

    const zoomTo = (value: number) => setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)))

    async function confirm() {
        if (!area || waiting) return
        const key = JSON.stringify(area)
        let blob = lastCrop.current?.area === key ? lastCrop.current.blob : undefined
        if (!blob) {
            setCropping(true)
            try {
                blob = await getCroppedImg(src, area)
                lastCrop.current = { area: key, blob }
            } catch {
                toast.error(t('imageCrop.failed'))
                return
            } finally {
                setCropping(false)
            }
        }
        onConfirm(blob)
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !waiting && onClose()}>
            <DialogContent
                className='sm:max-w-[520px]'
                onCloseAutoFocus={(event) => {
                    if (!returnFocus?.current) return
                    event.preventDefault()
                    returnFocus.current.focus()
                }}
            >
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className='relative h-[360px] overflow-hidden rounded-input bg-bg'>
                    <Cropper
                        image={src}
                        crop={crop}
                        zoom={zoom * fill}
                        minZoom={MIN_ZOOM * fill}
                        maxZoom={MAX_ZOOM * fill}
                        aspect={1}
                        cropShape={mask === 'round' ? 'round' : 'rect'}
                        cropSize={{ width: MASK, height: MASK }}
                        showGrid={false}
                        onCropChange={setCrop}
                        onZoomChange={(value) => zoomTo(value / fill)}
                        onMediaLoaded={({ width, height }) => setFill(MASK / Math.min(width, height))}
                        onCropComplete={(_area, pixels) => setArea(pixels)}
                        style={{
                            // react-easy-crop shades outside the mask with `color`.
                            cropAreaStyle: {
                                border: '2px solid rgb(var(--text-primary))',
                                color: 'var(--scrim)',
                                borderRadius: MASK_RADIUS[mask]
                            }
                        }}
                    />
                </div>
                <div className='mx-auto flex w-full max-w-[360px] items-center gap-2'>
                    <IconButton label={t('imageCrop.zoomOut')} onClick={() => zoomTo(zoom - ZOOM_STEP)}>
                        <ZoomOut />
                    </IconButton>
                    <Slider
                        aria-label={t('imageCrop.zoom')}
                        value={[zoom]}
                        min={MIN_ZOOM}
                        max={MAX_ZOOM}
                        step={0.01}
                        onValueChange={([value]) => zoomTo(value ?? MIN_ZOOM)}
                    />
                    <IconButton label={t('imageCrop.zoomIn')} onClick={() => zoomTo(zoom + ZOOM_STEP)}>
                        <ZoomIn />
                    </IconButton>
                </div>
                <DialogFooter>
                    <Button type='button' variant='text' disabled={waiting} onClick={onClose}>
                        {t('imageCrop.cancel')}
                    </Button>
                    <Button type='button' disabled={waiting || !area} onClick={() => void confirm()}>
                        {waiting ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
