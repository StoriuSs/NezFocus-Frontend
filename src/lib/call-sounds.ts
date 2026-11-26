import { playTones, type Tones } from './tones'

/**
 * The sounds of a 1-1 call (DESIGN.md › Sound, spec 09, D-241, D-255), not
 * under the phase sound's switch. Made by the browser (`tones.ts`): a browser
 * that will not play yet (a tab never touched) stays silent, the card still
 * shows (09 S-CALL-02).
 */

/** Ringing, to the one called: two notes, E5 then G#5, every 2 seconds. */
const RING: Tones = { notes: [659.3, 830.6], gap: 0.4 + 0.15, length: 0.4, volume: 0.35 }
const RING_EVERY_MS = 2000

/** Ringing back, to the caller while `calling`: one low A4, every 3 seconds, quieter. */
const RINGBACK: Tones = { notes: [440], gap: 0, length: 1, volume: 0.2 }
const RINGBACK_EVERY_MS = 3000

/** Over: two notes going down, E5 then C5. */
const END: Tones = { notes: [659.3, 523.3], gap: 0.2 + 0.22, length: 0.2, volume: 0.3 }

export type CallLoop = 'ring' | 'ringback'

/** Plays `loop` now and again at its pace until the returned function is called. */
export function startCallLoop(loop: CallLoop): () => void {
    const [tones, every] = loop === 'ring' ? [RING, RING_EVERY_MS] : [RINGBACK, RINGBACK_EVERY_MS]
    playTones(tones)
    const timer = setInterval(() => playTones(tones), every)
    return () => clearInterval(timer)
}

/** The short sound of a call over (both sides, every outcome but one's own Cancel or Decline). */
export function playCallEnd(): void {
    playTones(END)
}
