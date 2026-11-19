import { useEffect } from 'react'

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false

/**
 * Files dragged over or dropped where nothing takes them do nothing, rather
 * than the browser opening the file in place of the app (and leaving a voice
 * room with it, M4 L6b-a). A place that takes files (the chat's drop zone, a
 * new server's picture) says so first, on its own element: its event comes
 * here already handled and is left alone. Text or links dragged are not files
 * and stay the browser's.
 */
export function useRefuseFileDrops(on = true): void {
    useEffect(() => {
        if (!on) return
        const refuse = (event: DragEvent) => {
            if (!carriesFiles(event) || event.defaultPrevented) return
            event.preventDefault()
            event.dataTransfer!.dropEffect = 'none'
        }
        window.addEventListener('dragover', refuse)
        window.addEventListener('drop', refuse)
        return () => {
            window.removeEventListener('dragover', refuse)
            window.removeEventListener('drop', refuse)
        }
    }, [on])
}
