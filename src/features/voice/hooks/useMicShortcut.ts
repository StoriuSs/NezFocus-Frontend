import { useEffect } from 'react'
import type { DeviceState } from '@/lib/livekit'
import { switchMic } from '../lib/session'
import { useVoiceStore } from '../voice.store'

/** Whose mic the shortcut switches: how to read it and how to switch it. */
export interface MicControl {
    mic: () => DeviceState
    switchMic: (on: boolean) => unknown
}

/** The voice room's mic (this tab's, in the voice store). */
const ROOM_MIC: MicControl = { mic: () => useVoiceStore.getState().mic, switchMic }

/**
 * Ctrl+Shift+M switches the mic on the room's pages (07 › Tương tác), as its
 * button would: nothing without SPEAK or while the browser refuses it. A
 * call's page hands its own mic (`control`, DESIGN.md › Bàn phím, D-255).
 */
export function useMicShortcut(canSpeak: boolean, control: MicControl = ROOM_MIC): void {
    useEffect(() => {
        if (!canSpeak) return
        const onKey = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== 'm') return
            const mic = control.mic()
            if (mic === 'blocked') return
            event.preventDefault()
            void control.switchMic(mic !== 'on')
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [canSpeak, control])
}
