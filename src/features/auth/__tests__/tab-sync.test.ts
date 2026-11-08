import { describe, it, expect } from 'vitest'
import { tabMessageOf } from '../lib/tab-sync'

/** Another tab may run an older version of the app: only messages this one sends are acted on. */
describe('messages from the other tabs', () => {
    it('reads the messages this app sends', () => {
        expect(tabMessageOf({ type: 'signed-in', userId: 'user-1' })).toEqual({ type: 'signed-in', userId: 'user-1' })
        expect(
            tabMessageOf({ type: 'signed-out', reason: 'account-deleted', deletesAt: '2026-11-22T00:00:00.000Z' })
        ).toEqual({ type: 'signed-out', reason: 'account-deleted', deletesAt: '2026-11-22T00:00:00.000Z' })
        expect(tabMessageOf({ type: 'signed-out' })).toEqual({ type: 'signed-out' })
        expect(tabMessageOf({ type: 'restored' })).toEqual({ type: 'restored' })
    })

    it('ignores anything else: old plain strings, unknown types, reasons it does not know, wrong shapes', () => {
        expect(tabMessageOf('signed-out')).toBeNull()
        expect(tabMessageOf(null)).toBeNull()
        expect(tabMessageOf({ type: 'deleted' })).toBeNull()
        expect(tabMessageOf({ type: 'signed-out', reason: 'moon' })).toBeNull()
        expect(tabMessageOf({ type: 'signed-out', deletesAt: 42 })).toBeNull()
        expect(tabMessageOf({ type: 'signed-in', userId: 7 })).toBeNull()
    })
})
