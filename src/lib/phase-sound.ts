import { playTones } from './tones'

/**
 * The phase sound (REQ-STUDY-06, D-140): two short rising notes, C6 then E6,
 * made by the browser (`tones.ts`), so there is no file to download or
 * license. Played by "Play sample" on the Notifications page, and as a phase
 * begins in the study session one is in (`usePhaseSound` of study). Silent
 * where the browser has no Web Audio or will not play.
 */

/** C6 and E6, in hertz. */
export const PHASE_NOTES = [1046.5, 1318.51] as const

export function playPhaseSound(): void {
    // 0.2 was too quiet in the owner's manual test (L13); 0.4 is about twice as
    // loud. The notes never overlap, so this is also the loudest it gets: no clipping.
    playTones({ notes: PHASE_NOTES, gap: 0.3, length: 0.25, volume: 0.4 })
}
