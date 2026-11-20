import type { ServerChannel } from '../types'

/**
 * The lengths a study room's cycle may take, in minutes, and how often the
 * long break comes, in focus phases (REQ-STUDY-01, 07 S-ROOM-03). The same
 * as the backend's `STUDY_CYCLE_LIMITS` (servers/domain/study-room.rules.ts),
 * which checks again.
 */
export const STUDY_CYCLE_LIMITS = {
    focus: { min: 5, max: 120 },
    shortBreak: { min: 1, max: 30 },
    longBreak: { min: 5, max: 60 },
    longBreakEvery: { min: 2, max: 8 }
} as const

export type CycleField = keyof typeof STUDY_CYCLE_LIMITS

/** A cycle as saved: no long break when both of its halves are null. */
export interface StudyCycle {
    focus: number
    shortBreak: number
    longBreak: number | null
    longBreakEvery: number | null
}

/** The two presets of the SegmentedControl, both without a long break. */
export const CYCLE_PRESETS = {
    '25/5': { focus: 25, shortBreak: 5 },
    '50/10': { focus: 50, shortBreak: 10 }
} as const

export type CyclePreset = keyof typeof CYCLE_PRESETS
export type CycleChoice = CyclePreset | 'custom'

/** What turning the long break on fills in, when the room had none (07 S-ROOM-03). */
export const FIRST_LONG_BREAK = { longBreak: 15, longBreakEvery: 4 } as const

/** The cycle part of a form: the numbers as typed, so a field can be emptied while typing. */
export interface CycleForm {
    choice: CycleChoice
    focus: string
    shortBreak: string
    longBreakOn: boolean
    longBreak: string
    longBreakEvery: string
}

export const cycleOf = (channel: ServerChannel): StudyCycle => ({
    focus: channel.studyFocusMinutes,
    shortBreak: channel.studyShortBreakMinutes,
    longBreak: channel.studyLongBreakMinutes,
    longBreakEvery: channel.studyLongBreakEvery
})

/** The preset a saved cycle is, or Custom: other lengths, or a long break. */
export function cycleChoiceOf(cycle: StudyCycle): CycleChoice {
    if (cycle.longBreak !== null || cycle.longBreakEvery !== null) return 'custom'
    const preset = (Object.keys(CYCLE_PRESETS) as CyclePreset[]).find(
        (key) => CYCLE_PRESETS[key].focus === cycle.focus && CYCLE_PRESETS[key].shortBreak === cycle.shortBreak
    )
    return preset ?? 'custom'
}

/** A saved cycle as the form starts with it: Custom holds the saved lengths. */
export function cycleFormOf(cycle: StudyCycle): CycleForm {
    return {
        choice: cycleChoiceOf(cycle),
        focus: String(cycle.focus),
        shortBreak: String(cycle.shortBreak),
        longBreakOn: cycle.longBreak !== null,
        longBreak: String(cycle.longBreak ?? FIRST_LONG_BREAK.longBreak),
        longBreakEvery: String(cycle.longBreakEvery ?? FIRST_LONG_BREAK.longBreakEvery)
    }
}

/** What was typed, as a number in the field's range; anything else is null. */
function inRange(field: CycleField, typed: string): number | null {
    if (!/^\d{1,3}$/.test(typed)) return null
    const value = Number(typed)
    const { min, max } = STUDY_CYCLE_LIMITS[field]
    return value >= min && value <= max ? value : null
}

/** The number fields shown: none on a preset; on Custom, the long break's two only while its switch is on. */
export function shownCycleFields(form: CycleForm): CycleField[] {
    if (form.choice !== 'custom') return []
    return form.longBreakOn ? ['focus', 'shortBreak', 'longBreak', 'longBreakEvery'] : ['focus', 'shortBreak']
}

/** The fields shown out of their range, empty ones too, checked when Save is pressed (C-22). */
export const badCycleFields = (form: CycleForm): CycleField[] =>
    shownCycleFields(form).filter((field) => inRange(field, form[field]) === null)

/** The cycle the form would save, or null while a field of Custom is out of range. */
export function chosenCycle(form: CycleForm): StudyCycle | null {
    if (form.choice !== 'custom') return { ...CYCLE_PRESETS[form.choice], longBreak: null, longBreakEvery: null }
    if (badCycleFields(form).length > 0) return null
    const number = (field: CycleField) => inRange(field, form[field]) as number
    return {
        focus: number('focus'),
        shortBreak: number('shortBreak'),
        longBreak: form.longBreakOn ? number('longBreak') : null,
        longBreakEvery: form.longBreakOn ? number('longBreakEvery') : null
    }
}

/** ↑ / ↓ on a number field: one more or less, kept in its range (C-22); from empty, the lowest. */
export function stepCycleNumber(field: CycleField, typed: string, step: 1 | -1): string {
    const { min, max } = STUDY_CYCLE_LIMITS[field]
    if (typed === '') return String(min)
    return String(Math.min(max, Math.max(min, Number(typed) + step)))
}

const PROBLEM_FIELDS = new Map<unknown, CycleField>([
    ['focus_minutes', 'focus'],
    ['short_break_minutes', 'shortBreak'],
    ['long_break_minutes', 'longBreak'],
    ['long_break_every', 'longBreakEvery'],
    ['long_break_pair', 'longBreak']
])

/** The field a `study_cycle` refusal is about (its `problem`, backend StudyCycleProblem). */
export const cycleFieldOfProblem = (problem: unknown): CycleField | null => PROBLEM_FIELDS.get(problem) ?? null
