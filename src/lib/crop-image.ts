export interface PixelCrop {
    x: number
    y: number
    width: number
    height: number
}

/** Largest edge of the exported avatar. Plenty for display, far below any browser canvas limit. */
export const MAX_AVATAR_SIZE = 1024

export const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image()
        image.addEventListener('load', () => resolve(image))
        image.addEventListener('error', () => reject(new Error('The selected file could not be read as an image')))
        image.src = url
    })

/** Output dimensions for a crop, scaled down so the longest edge is at most `maxSize`. */
export function getOutputSize(crop: PixelCrop, maxSize = MAX_AVATAR_SIZE): { width: number; height: number } {
    const scale = Math.min(1, maxSize / Math.max(crop.width, crop.height))
    return {
        width: Math.max(1, Math.round(crop.width * scale)),
        height: Math.max(1, Math.round(crop.height * scale))
    }
}

/**
 * Crops `imageSrc` to `pixelCrop` and returns it as a JPEG blob.
 *
 * Draws only the cropped region, straight into a canvas sized for the output.
 * The previous version first drew the *whole* source image at full resolution:
 * a phone photo (e.g. 4000×6000) exceeds the canvas area limit on iOS Safari
 * (16.7M px) and some Android browsers, where the canvas silently stays blank
 * and `toBlob` yields null — so "Save" did nothing and showed no error.
 *
 * Rejects rather than resolving null, so the caller always gets a result or
 * an error it can show.
 */
export default async function getCroppedImg(
    imageSrc: string,
    pixelCrop: PixelCrop,
    { maxSize = MAX_AVATAR_SIZE, quality = 0.9 }: { maxSize?: number; quality?: number } = {}
): Promise<Blob> {
    const image = await createImage(imageSrc)
    const { width, height } = getOutputSize(pixelCrop, maxSize)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
        throw new Error('Canvas 2D context is not available')
    }

    // JPEG has no alpha: paint a background so transparent PNGs don't turn black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, width, height)

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Failed to export the cropped image'))),
            'image/jpeg',
            quality
        )
    })
}
