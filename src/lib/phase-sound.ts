/**
 * The phase sound (REQ-STUDY-06, D-140): two short rising notes, C6 then E6,
 * made by the browser, so there is no file to download or license. Played
 * by "Play sample" on the Notifications page now, and when a study phase ends
 * from M5. Silent where the browser has no Web Audio or will not play.
 */

/** C6 and E6, in hertz. */
export const PHASE_NOTES = [1046.5, 1318.51] as const
/** When each note starts, from the first, in seconds. */
const NOTE_GAP = 0.3
/** How long a note rings before it has faded out, in seconds. */
const NOTE_LENGTH = 0.25
/**
 * The peak of each note, from 0 to 1 (full scale). 0.2 was too quiet in the
 * owner's manual test (L13); 0.4 is about twice as loud. The notes never
 * overlap, so this is also the loudest the sound gets: no clipping.
 */
const VOLUME = 0.4

type AudioContextClass = typeof AudioContext

let context: AudioContext | null = null

function audioContextClass(): AudioContextClass | undefined {
    if (typeof window === 'undefined') return undefined
    return window.AudioContext ?? (window as { webkitAudioContext?: AudioContextClass }).webkitAudioContext
}

export function playPhaseSound(): void {
    const Context = audioContextClass()
    if (!Context) return
    try {
        context ??= new Context()
        // Safari starts a context suspended until the page has been clicked.
        void context.resume().catch(() => undefined)
        const audio = context
        PHASE_NOTES.forEach((frequency, index) => {
            const at = audio.currentTime + index * NOTE_GAP
            const oscillator = audio.createOscillator()
            const gain = audio.createGain()
            oscillator.type = 'sine'
            oscillator.frequency.setValueAtTime(frequency, at)
            // A quick rise and a soft fade: no click at either end.
            gain.gain.setValueAtTime(0, at)
            gain.gain.linearRampToValueAtTime(VOLUME, at + 0.01)
            gain.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_LENGTH)
            oscillator.connect(gain).connect(audio.destination)
            oscillator.start(at)
            oscillator.stop(at + NOTE_LENGTH)
        })
    } catch {
        // The browser would not play. Drop the context so the next try starts a fresh one.
        context = null
    }
}
