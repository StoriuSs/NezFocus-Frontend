import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Records what the sound asks the browser for; jsdom has no Web Audio. */
class FakeAudioContext {
    static made = 0
    readonly currentTime = 10
    readonly destination = {}
    readonly notes: { frequency: number; start: number; stop: number }[] = []
    constructor() {
        FakeAudioContext.made += 1
        contexts.push(this)
    }
    resume = vi.fn(() => Promise.resolve())
    createGain() {
        const param = {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn()
        }
        return { gain: param, connect: (next: unknown) => next }
    }
    createOscillator() {
        const note = { frequency: 0, start: 0, stop: 0 }
        this.notes.push(note)
        return {
            type: '',
            frequency: { setValueAtTime: (value: number) => (note.frequency = value) },
            connect: (next: unknown) => next,
            start: (at: number) => (note.start = at),
            stop: (at: number) => (note.stop = at)
        }
    }
}
let contexts: FakeAudioContext[] = []

// D-140: two short rising notes made by the browser, no file.
describe('the phase sound', () => {
    beforeEach(() => {
        contexts = []
        FakeAudioContext.made = 0
        vi.resetModules()
    })
    afterEach(() => vi.unstubAllGlobals())

    it('plays C6 then E6, short, the second just after the first', async () => {
        vi.stubGlobal('AudioContext', FakeAudioContext)
        const { playPhaseSound, PHASE_NOTES } = await import('@/lib/phase-sound')

        playPhaseSound()

        const [first, second] = contexts[0]?.notes ?? []
        if (!first || !second) throw new Error('expected two notes')
        expect([first.frequency, second.frequency]).toEqual([...PHASE_NOTES])
        expect(first.start).toBe(10)
        expect(second.start).toBeGreaterThan(first.stop)
        expect(second.stop - first.start).toBeLessThan(0.7)
    })

    it('reuses one audio context however often it plays', async () => {
        vi.stubGlobal('AudioContext', FakeAudioContext)
        const { playPhaseSound } = await import('@/lib/phase-sound')

        playPhaseSound()
        playPhaseSound()

        expect(FakeAudioContext.made).toBe(1)
        expect(contexts[0]?.notes).toHaveLength(4)
    })

    it('stays silent, without an error, where the browser has no Web Audio or refuses it', async () => {
        vi.stubGlobal('AudioContext', undefined)
        const { playPhaseSound } = await import('@/lib/phase-sound')
        expect(() => playPhaseSound()).not.toThrow()

        vi.stubGlobal(
            'AudioContext',
            class {
                constructor() {
                    throw new Error('NotAllowedError')
                }
            }
        )
        expect(() => playPhaseSound()).not.toThrow()
    })
})
