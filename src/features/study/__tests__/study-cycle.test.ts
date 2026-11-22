import { describe, expect, it } from 'vitest'
import {
    badCycleFields,
    chosenCycle,
    cycleChoiceOf,
    cycleFieldOfProblem,
    shownCycleFields,
    stepCycleNumber,
    type CycleForm
} from '../lib/study-cycle'

const custom = (extra: Partial<CycleForm> = {}): CycleForm => ({
    choice: 'custom',
    focus: '45',
    shortBreak: '10',
    longBreakOn: false,
    longBreak: '15',
    longBreakEvery: '4',
    ...extra
})

describe('study cycle (S-SET-06, 07 S-ROOM-03)', () => {
    it('opens a stored cycle on its preset, or on Custom when it has a long break or other lengths', () => {
        expect(cycleChoiceOf({ focus: 25, shortBreak: 5, longBreak: null, longBreakEvery: null })).toBe('25/5')
        expect(cycleChoiceOf({ focus: 50, shortBreak: 10, longBreak: null, longBreakEvery: null })).toBe('50/10')
        expect(cycleChoiceOf({ focus: 25, shortBreak: 5, longBreak: 15, longBreakEvery: 4 })).toBe('custom')
        expect(cycleChoiceOf({ focus: 45, shortBreak: 10, longBreak: null, longBreakEvery: null })).toBe('custom')
    })

    it('saves a preset with no long break, whatever Custom holds', () => {
        expect(chosenCycle(custom({ choice: '50/10', focus: '150', longBreakOn: true }))).toEqual({
            focus: 50,
            shortBreak: 10,
            longBreak: null,
            longBreakEvery: null
        })
    })

    it('saves Custom as typed, the long break only while its switch is on', () => {
        expect(chosenCycle(custom())).toEqual({ focus: 45, shortBreak: 10, longBreak: null, longBreakEvery: null })
        expect(chosenCycle(custom({ longBreakOn: true, longBreak: '20' }))).toEqual({
            focus: 45,
            shortBreak: 10,
            longBreak: 20,
            longBreakEvery: 4
        })
    })

    it('finds each field out of its range, empty ones too, and nothing to save then', () => {
        expect(badCycleFields(custom({ focus: '150', shortBreak: '' }))).toEqual(['focus', 'shortBreak'])
        expect(badCycleFields(custom({ focus: '4', shortBreak: '31' }))).toEqual(['focus', 'shortBreak'])
        expect(badCycleFields(custom({ focus: '5', shortBreak: '30' }))).toEqual([])
        expect(chosenCycle(custom({ focus: '150' }))).toBeNull()
    })

    it('checks the long break fields only while the switch is on', () => {
        const longBreak = { longBreak: '61', longBreakEvery: '1' }
        expect(badCycleFields(custom(longBreak))).toEqual([])
        expect(badCycleFields(custom({ ...longBreak, longBreakOn: true }))).toEqual(['longBreak', 'longBreakEvery'])
        expect(badCycleFields(custom({ longBreakOn: true, longBreak: '60', longBreakEvery: '8' }))).toEqual([])
    })

    it('checks nothing on a preset', () => {
        expect(badCycleFields(custom({ choice: '25/5', focus: '' }))).toEqual([])
    })

    it('shows no number field on a preset, the long break two only while its switch is on', () => {
        expect(shownCycleFields(custom({ choice: '50/10', longBreakOn: true }))).toEqual([])
        expect(shownCycleFields(custom())).toEqual(['focus', 'shortBreak'])
        expect(shownCycleFields(custom({ longBreakOn: true }))).toEqual([
            'focus',
            'shortBreak',
            'longBreak',
            'longBreakEvery'
        ])
    })

    it('steps a number by one with the arrow keys, kept in its range (C-22)', () => {
        expect(stepCycleNumber('focus', '45', 1)).toBe('46')
        expect(stepCycleNumber('focus', '120', 1)).toBe('120')
        expect(stepCycleNumber('focus', '5', -1)).toBe('5')
        expect(stepCycleNumber('focus', '', 1)).toBe('5')
        expect(stepCycleNumber('focus', '150', -1)).toBe('120')
    })

    it('puts a refusal of the backend under the field it names (study_cycle problem)', () => {
        expect(cycleFieldOfProblem('focus_minutes')).toBe('focus')
        expect(cycleFieldOfProblem('short_break_minutes')).toBe('shortBreak')
        expect(cycleFieldOfProblem('long_break_minutes')).toBe('longBreak')
        expect(cycleFieldOfProblem('long_break_every')).toBe('longBreakEvery')
        expect(cycleFieldOfProblem('long_break_pair')).toBe('longBreak')
        expect(cycleFieldOfProblem('something_else')).toBeNull()
        expect(cycleFieldOfProblem('toString')).toBeNull()
        expect(cycleFieldOfProblem(undefined)).toBeNull()
    })
})
