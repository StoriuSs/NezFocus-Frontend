import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import getCroppedImg, { getOutputSize, MAX_AVATAR_SIZE } from '../crop-image'

/** jsdom loads no images and draws on no canvas: both are stood in for. */
function fakeCanvas({ context = true, blob = true } = {}) {
    const drawImage = vi.fn()
    const canvas = {
        width: 0,
        height: 0,
        getContext: () => (context ? { fillRect: vi.fn(), drawImage, fillStyle: '', imageSmoothingQuality: '' } : null),
        toBlob: (done: (blob: Blob | null) => void) => done(blob ? new Blob(['jpeg']) : null)
    }
    const create = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
        tag === 'canvas' ? (canvas as unknown as HTMLCanvasElement) : create(tag)
    )
    return { canvas, drawImage }
}

class LoadingImage {
    private listeners: Record<string, () => void> = {}
    static fails = false
    addEventListener(event: string, listener: () => void) {
        this.listeners[event] = listener
    }
    set src(_url: string) {
        queueMicrotask(() => this.listeners[LoadingImage.fails ? 'error' : 'load']?.())
    }
}

describe('cropping a picture', () => {
    beforeEach(() => {
        LoadingImage.fails = false
        vi.stubGlobal('Image', LoadingImage)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('keeps a small crop as it is, and scales a large one down to the longest edge', () => {
        expect(getOutputSize({ x: 0, y: 0, width: 280, height: 280 })).toEqual({ width: 280, height: 280 })
        expect(getOutputSize({ x: 0, y: 0, width: 4000, height: 2000 })).toEqual({
            width: MAX_AVATAR_SIZE,
            height: MAX_AVATAR_SIZE / 2
        })
    })

    it('draws only the cropped region, into a canvas of the output size', async () => {
        const { canvas, drawImage } = fakeCanvas()
        const blob = await getCroppedImg('blob:x', { x: 10, y: 20, width: 2048, height: 2048 })
        expect(blob).toBeInstanceOf(Blob)
        expect([canvas.width, canvas.height]).toEqual([MAX_AVATAR_SIZE, MAX_AVATAR_SIZE])
        expect(drawImage).toHaveBeenCalledWith(
            expect.anything(),
            10,
            20,
            2048,
            2048,
            0,
            0,
            MAX_AVATAR_SIZE,
            MAX_AVATAR_SIZE
        )
    })

    it('rejects, never resolving empty, when the image or the canvas fails', async () => {
        const area = { x: 0, y: 0, width: 100, height: 100 }
        fakeCanvas({ blob: false })
        await expect(getCroppedImg('blob:x', area)).rejects.toThrow('Failed to export')

        vi.restoreAllMocks()
        fakeCanvas({ context: false })
        await expect(getCroppedImg('blob:x', area)).rejects.toThrow('Canvas 2D context')

        LoadingImage.fails = true
        await expect(getCroppedImg('blob:x', area)).rejects.toThrow('could not be read')
    })
})
