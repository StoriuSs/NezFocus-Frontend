/**
 * Short notes made by the browser (DESIGN.md › Sound, D-140, D-241): sine
 * waves with a quick rise and a soft fade, so there is no file to download
 * or license. The phase sound and the call sounds play through here. Silent
 * where the browser has no Web Audio or will not play (a tab not yet touched).
 */

/** What to play: each note in turn, `gap` seconds apart, each fading out over `length`. */
export interface Tones {
    /** In hertz. */
    notes: readonly number[]
    /** When each note starts, from the one before, in seconds. */
    gap: number
    /** How long a note rings before it has faded out, in seconds. */
    length: number
    /** The peak of each note, from 0 to 1 (full scale). */
    volume: number
}

type AudioContextClass = typeof AudioContext

let context: AudioContext | null = null

function audioContextClass(): AudioContextClass | undefined {
    if (typeof window === 'undefined') return undefined
    return window.AudioContext ?? (window as { webkitAudioContext?: AudioContextClass }).webkitAudioContext
}

/** Plays `tones` once, now. One audio context for the tab, however often. */
export function playTones({ notes, gap, length, volume }: Tones): void {
    const Context = audioContextClass()
    if (!Context) return
    try {
        context ??= new Context()
        // Safari starts a context suspended until the page has been clicked.
        void context.resume().catch(() => undefined)
        const audio = context
        notes.forEach((frequency, index) => {
            const at = audio.currentTime + index * gap
            const oscillator = audio.createOscillator()
            const gain = audio.createGain()
            oscillator.type = 'sine'
            oscillator.frequency.setValueAtTime(frequency, at)
            // A quick rise and a soft fade: no click at either end.
            gain.gain.setValueAtTime(0, at)
            gain.gain.linearRampToValueAtTime(volume, at + 0.01)
            gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
            oscillator.connect(gain).connect(audio.destination)
            oscillator.start(at)
            oscillator.stop(at + length)
        })
    } catch {
        // The browser would not play. Drop the context so the next try starts a fresh one.
        context = null
    }
}
