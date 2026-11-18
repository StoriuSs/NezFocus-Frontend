import type { MicState } from '@/lib/livekit'

/**
 * Asks the browser for the microphone before joining (the preview page's
 * Mic, REQ-VC-03, D-36): it asks the person only now, on the press. The
 * sound itself is not kept: joining takes the microphone again.
 */
export async function askMicrophone(): Promise<MicState> {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        for (const track of stream.getTracks()) track.stop()
        return 'on'
    } catch (error) {
        return error instanceof DOMException && error.name === 'NotAllowedError' ? 'blocked' : 'off'
    }
}

/**
 * Calls `onAllowed` when the browser lets the microphone be used again
 * (S-MOD-04: the Banner goes, the button back to `off`). Browsers that do not
 * tell (no Permissions API for it) need a reload, as the Popover says.
 * Returns the way to stop listening.
 */
export function whenMicrophoneAllowed(onAllowed: () => void): () => void {
    let stopped = false
    let status: PermissionStatus | null = null
    const changed = () => {
        if (status?.state !== 'denied') onAllowed()
    }
    navigator.permissions
        ?.query({ name: 'microphone' as PermissionName })
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
