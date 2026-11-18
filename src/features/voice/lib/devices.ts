import type { DeviceState } from '@/lib/livekit'

/** A device the browser asks the person for (S-MOD-04). */
export type Device = 'mic' | 'camera'

const refusedState = (error: unknown): DeviceState =>
    error instanceof DOMException && error.name === 'NotAllowedError' ? 'blocked' : 'off'

/**
 * Asks the browser for the microphone before joining (the preview page's
 * Mic, REQ-VC-03, D-36): it asks the person only now, on the press. The
 * sound itself is not kept: joining takes the microphone again.
 */
export async function askMicrophone(): Promise<DeviceState> {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        for (const track of stream.getTracks()) track.stop()
        return 'on'
    } catch (error) {
        return refusedState(error)
    }
}

/**
 * Opens the camera before joining, for one's own tile on the preview page
 * (D-53, REQ-VC-03): the browser asks the person on this first press. The
 * picture is kept until the camera goes off, the page goes, or the room is
 * joined (LiveKit then opens the camera itself).
 */
export async function openCamera(): Promise<{ state: DeviceState; stream: MediaStream | null }> {
    try {
        return { state: 'on', stream: await navigator.mediaDevices.getUserMedia({ video: true }) }
    } catch (error) {
        return { state: refusedState(error), stream: null }
    }
}

/** Stops a picture opened by `openCamera` (the camera's light goes off). */
export function closeCamera(stream: MediaStream | null): void {
    for (const track of stream?.getTracks() ?? []) track.stop()
}

const PERMISSIONS: Record<Device, string> = { mic: 'microphone', camera: 'camera' }

/**
 * Calls `onAllowed` when the browser lets `device` be used again (S-MOD-04:
 * the Banner goes, the button back to `off`). Browsers that do not tell (no
 * Permissions API for it) need a reload, as the Popover says. Returns the way
 * to stop listening.
 */
export function whenDeviceAllowed(device: Device, onAllowed: () => void): () => void {
    let stopped = false
    let status: PermissionStatus | null = null
    const changed = () => {
        if (status?.state !== 'denied') onAllowed()
    }
    navigator.permissions
        ?.query({ name: PERMISSIONS[device] as PermissionName })
        .then((answer) => {
            if (stopped) return
            status = answer
            answer.addEventListener('change', changed)
        })
        .catch(() => undefined)
    return () => {
        stopped = true
        status?.removeEventListener('change', changed)
    }
}
