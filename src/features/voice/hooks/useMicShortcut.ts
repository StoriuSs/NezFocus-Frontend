import { useEffect } from 'react'
import { switchMic } from '../lib/session'
import { useVoiceStore } from '../voice.store'

/**
 * Ctrl+Shift+M switches the mic on the room's pages (07 › Tương tác), as its
 * button would: nothing without SPEAK or while the browser refuses it.
 */
export function useMicShortcut(canSpeak: boolean): void {
    useEffect(() => {
        if (!canSpeak) return
        const onKey = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== 'm') return
            const { mic } = useVoiceStore.getState()
            if (mic === 'blocked') return
            event.preventDefault()
            void switchMic(mic !== 'on')
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [canSpeak])
}
