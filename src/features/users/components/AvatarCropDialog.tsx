import { useRef, useState } from 'react'
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
import { useUpdateAvatar } from '@/features/users/api/useUpdateAvatar'
import getCroppedImg from '@/features/users/lib/crop-image'

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25

/**
 * "Crop your profile picture" (S-ME-02 `avatar-crop`, Q6): a round mask of
 * 280 over the chosen image, dragged to place it, zoomed 100-300% with the
 * slider (or the wheel). "Save photo" uploads at once; while it does, the
 * dialog stays (Esc and Cancel wait, `avatar-uploading`). Saved, it closes.
 *
 * `src` is an object URL of the chosen file, the caller's to release.
 */
export function AvatarCropDialog({ src, onClose }: { src: string; onClose: () => void }) {
    const { t } = useTranslation('users')
    const upload = useUpdateAvatar()
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(MIN_ZOOM)
    const [cropping, setCropping] = useState(false)
    // Known once the image has loaded: saving waits for it.
    const [area, setArea] = useState<Area | null>(null)
    /**
     * The last crop, so saving the same area again sends the same Blob:
     * idempotency keys follow the payload, and a Blob only equals itself.
     */
    const lastCrop = useRef<{ area: string; blob: Blob } | null>(null)
    const busy = cropping || upload.isPending

    const zoomTo = (value: number) => setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)))

    async function save() {
        if (!area || busy) return
        const key = JSON.stringify(area)
        let blob = lastCrop.current?.area === key ? lastCrop.current.blob : undefined
        if (!blob) {
            setCropping(true)
            try {
                blob = await getCroppedImg(src, area)
                lastCrop.current = { area: key, blob }
            } catch {
                toast.error(t('toasts.cropFailed'))
                return
            } finally {
                setCropping(false)
            }
        }
        // A refusal is toasted by the query client; the dialog stays to try again.
        upload.mutate(blob, { onSuccess: onClose })
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
            <DialogContent className='sm:max-w-[520px]'>
                <DialogHeader>
                    <DialogTitle>{t('crop.title')}</DialogTitle>
                    <DialogDescription>{t('crop.description')}</DialogDescription>
                </DialogHeader>
                <div className='relative h-[360px] overflow-hidden rounded-input bg-bg'>
                    <Cropper
                        image={src}
                        crop={crop}
                        zoom={zoom}
                        minZoom={MIN_ZOOM}
                        maxZoom={MAX_ZOOM}
                        aspect={1}
                        cropShape='round'
                        cropSize={{ width: 280, height: 280 }}
                        showGrid={false}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={(_area, pixels) => setArea(pixels)}
                        style={{
                            // The ring 2 `text-primary`; outside it, `scrim` (react-easy-crop shades with `color`).
                            cropAreaStyle: { border: '2px solid rgb(var(--text-primary))', color: 'var(--scrim)' }
                        }}
                    />
                </div>
                <div className='mx-auto flex w-full max-w-[360px] items-center gap-2'>
                    <IconButton label={t('crop.zoomOut')} onClick={() => zoomTo(zoom - ZOOM_STEP)}>
                        <ZoomOut />
                    </IconButton>
                    <Slider
                        aria-label={t('crop.zoom')}
                        value={[zoom]}
                        min={MIN_ZOOM}
                        max={MAX_ZOOM}
                        step={0.01}
                        onValueChange={([value]) => zoomTo(value ?? MIN_ZOOM)}
                    />
                    <IconButton label={t('crop.zoomIn')} onClick={() => zoomTo(zoom + ZOOM_STEP)}>
                        <ZoomIn />
                    </IconButton>
                </div>
                <DialogFooter>
                    <Button type='button' variant='text' disabled={busy} onClick={onClose}>
                        {t('crop.cancel')}
                    </Button>
                    <Button type='button' disabled={busy || !area} onClick={() => void save()}>
                        {busy ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {t('crop.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
