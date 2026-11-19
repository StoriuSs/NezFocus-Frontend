import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gridOf, orderPeople, personName } from '../lib/people'
import { forgetRoom, keepRoom, takeRoomToRejoin, wasReloaded } from '../lib/rejoin'
import { askMicrophone, closeCamera, openCamera, whenDeviceAllowed } from '../lib/devices'
import { canShareScreen, fitted, hiddenEnds, sharerOf } from '../lib/share'
import type { RoomPerson } from '../types'

const person = (
    id: string,
    on: Partial<Pick<RoomPerson, 'micOn' | 'cameraOn' | 'screenSharing'>> = {}
): RoomPerson => ({
    user: { id, username: id, displayName: null, avatarUrl: null },
    roleIds: [],
    isOwner: false,
    joinedAt: '2026-11-18T14:40:00.000Z',
    micOn: false,
    cameraOn: false,
    screenSharing: false,
    modMuted: false,
    ...on
})

describe('the order people show in a room (C-06, C-18)', () => {
    it('puts oneself first, then those with a mic or camera on, then who joined first', () => {
        const people = [
            person('nam'),
            person('tuan', { micOn: true }),
            person('an'),
            person('minh', { cameraOn: true })
        ]
        expect(orderPeople(people, 'an', [])).toEqual(['an', 'tuan', 'minh', 'nam'])
        expect(orderPeople(people, undefined, [])).toEqual(['tuan', 'minh', 'nam', 'an'])
    })

    it('keeps places once shown: a mic switched on moves no one, newcomers go to the end, oneself first', () => {
        const shown = ['tuan', 'nam']
        const people = [person('tuan'), person('nam', { micOn: true }), person('hoa')]
        expect(orderPeople(people, undefined, shown)).toEqual(['tuan', 'nam', 'hoa'])
        expect(orderPeople([person('nam'), person('an')], 'an', shown)).toEqual(['an', 'nam'])
    })

    it('works it out afresh when no one shown is still there', () => {
        expect(orderPeople([person('hoa'), person('lan', { micOn: true })], undefined, ['tuan'])).toEqual([
            'lan',
            'hoa'
        ])
    })

    it('names someone by their display name, else their username; none once deleted (D-182)', () => {
        expect(personName({ id: 'a', username: 'an.nguyen', displayName: 'An', avatarUrl: null })).toBe('An')
        expect(personName({ id: 'a', username: 'an.nguyen', displayName: null, avatarUrl: null })).toBe('an.nguyen')
        expect(personName({ id: 'a', username: null, displayName: null, avatarUrl: null })).toBeNull()
    })

    it('lays the room out in 1, 2, 3 or 4 columns, as wide as C-20 allows', () => {
        expect(gridOf(1)).toEqual({ columns: 1, maxWidth: 480 })
        expect(gridOf(4)).toEqual({ columns: 2, maxWidth: 480 })
        expect(gridOf(5)).toEqual({ columns: 3, maxWidth: 320 })
        expect(gridOf(9)).toEqual({ columns: 3, maxWidth: 320 })
        expect(gridOf(13)).toEqual({ columns: 4, maxWidth: 254 })
    })
})

describe('joining again after a reload (VC-02, D-51)', () => {
    const navigation = (type: string) =>
        vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type } as unknown as PerformanceEntry])
    beforeEach(() => sessionStorage.clear())
    afterEach(() => vi.restoreAllMocks())

    it('gives the room kept once, on a reload only', () => {
        navigation('reload')
        keepRoom({ serverId: 'ot', channelId: 'quiet' })
        expect(wasReloaded()).toBe(true)
        expect(takeRoomToRejoin()).toEqual({ serverId: 'ot', channelId: 'quiet' })
        expect(takeRoomToRejoin()).toBeNull()
    })

    it('drops the copy a duplicated or new tab carries: not a reload', () => {
        navigation('navigate')
        keepRoom({ serverId: 'ot', channelId: 'quiet' })
        expect(takeRoomToRejoin()).toBeNull()
        expect(sessionStorage.getItem('voice.room')).toBeNull()
    })

    it('joins nothing from a kept room it cannot read, or one forgotten', () => {
        navigation('reload')
        sessionStorage.setItem('voice.room', '{not json')
        expect(takeRoomToRejoin()).toBeNull()
        sessionStorage.setItem('voice.room', JSON.stringify({ serverId: 'ot' }))
        expect(takeRoomToRejoin()).toBeNull()
        keepRoom({ serverId: 'ot', channelId: 'quiet' })
        forgetRoom()
        expect(takeRoomToRejoin()).toBeNull()
    })
})

describe("the browser's microphone (S-MOD-04)", () => {
    afterEach(() => vi.restoreAllMocks())

    it('asks for it and lets it go at once: on, refused, or no device', async () => {
        const stop = vi.fn()
        const getUserMedia = vi
            .fn()
            .mockResolvedValueOnce({ getTracks: () => [{ stop }] })
            .mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'))
            .mockRejectedValueOnce(new Error('none'))
        Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
        expect(await askMicrophone()).toBe('on')
        expect(stop).toHaveBeenCalled()
        expect(await askMicrophone()).toBe('blocked')
        expect(await askMicrophone()).toBe('off')
    })

    it('hears the browser allow it again, and stops hearing when asked', async () => {
        const status = Object.assign(new EventTarget(), { state: 'denied' as PermissionState })
        const query = vi.fn(async () => status)
        Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true })
        const allowed = vi.fn()
        const stop = whenDeviceAllowed('mic', allowed)
        await vi.waitFor(() => expect(query).toHaveBeenCalledWith({ name: 'microphone' }))
        await Promise.resolve()
        status.dispatchEvent(new Event('change'))
        expect(allowed).not.toHaveBeenCalled()
        status.state = 'prompt'
        status.dispatchEvent(new Event('change'))
        expect(allowed).toHaveBeenCalledTimes(1)
        stop()
        status.dispatchEvent(new Event('change'))
        expect(allowed).toHaveBeenCalledTimes(1)
    })

    it('says nothing where the browser cannot tell, and nothing once stopped before it answers', async () => {
        Object.defineProperty(navigator, 'permissions', {
            value: { query: vi.fn(async () => Promise.reject(new TypeError('microphone'))) },
            configurable: true
        })
        expect(() => whenDeviceAllowed('mic', vi.fn())()).not.toThrow()
        const status = Object.assign(new EventTarget(), { state: 'denied' as PermissionState })
        Object.defineProperty(navigator, 'permissions', {
            value: { query: vi.fn(async () => status) },
            configurable: true
        })
        const allowed = vi.fn()
        whenDeviceAllowed('mic', allowed)()
        await Promise.resolve()
        status.state = 'granted'
        status.dispatchEvent(new Event('change'))
        expect(allowed).not.toHaveBeenCalled()
    })
})

describe("the browser's camera before joining (D-53, S-MOD-04)", () => {
    afterEach(() => vi.restoreAllMocks())

    it('opens it for the preview and closes it: on, refused, or no device', async () => {
        const stop = vi.fn()
        const stream = { getTracks: () => [{ stop }] }
        const getUserMedia = vi
            .fn()
            .mockResolvedValueOnce(stream)
            .mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'))
            .mockRejectedValueOnce(new Error('none'))
        Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
        expect(await openCamera()).toEqual({ state: 'on', stream })
        expect(getUserMedia).toHaveBeenCalledWith({ video: true })
        expect(stop).not.toHaveBeenCalled()
        closeCamera(stream as unknown as MediaStream)
        expect(stop).toHaveBeenCalled()
        expect(await openCamera()).toEqual({ state: 'blocked', stream: null })
        expect(await openCamera()).toEqual({ state: 'off', stream: null })
        expect(() => closeCamera(null)).not.toThrow()
    })

    it("hears the browser allow the camera again, by the camera's own permission", async () => {
        const status = Object.assign(new EventTarget(), { state: 'denied' as PermissionState })
        const query = vi.fn(async () => status)
        Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true })
        const allowed = vi.fn()
        whenDeviceAllowed('camera', allowed)
        await vi.waitFor(() => expect(query).toHaveBeenCalledWith({ name: 'camera' }))
        await Promise.resolve()
        status.state = 'granted'
        status.dispatchEvent(new Event('change'))
        expect(allowed).toHaveBeenCalledTimes(1)
    })
})

describe('screen sharing (REQ-VC-05, D-101, C-31)', () => {
    afterEach(() => vi.unstubAllGlobals())

    it("shows one screen: the API's sharer while two are sent, else LiveKit's first", () => {
        expect(sharerOf([], undefined)).toBeUndefined()
        expect(sharerOf(['an'], undefined)).toBe('an')
        expect(sharerOf(['phong', 'an'], 'an')).toBe('an')
        expect(sharerOf(['phong', 'an'], undefined)).toBe('phong')
        // The API's sharer no longer sending (its stop on the way): LiveKit's.
        expect(sharerOf(['phong'], 'an')).toBe('phong')
        expect(sharerOf([], 'an')).toBeUndefined()
    })

    it('fits a screen whole in the stage, its shape kept (portrait-share, 21:9)', () => {
        expect(fitted({ width: 1048, height: 540 }, { width: 1920, height: 1080 })).toEqual({ width: 960, height: 540 })
        expect(fitted({ width: 1048, height: 540 }, { width: 600, height: 800 })).toEqual({ width: 405, height: 540 })
        expect(fitted({ width: 1048, height: 540 }, { width: 2560, height: 1080 })).toEqual({
            width: 1048,
            height: 442
        })
        expect(fitted({ width: 0, height: 540 }, { width: 16, height: 9 })).toEqual({ width: 0, height: 0 })
        expect(fitted({ width: 100, height: 100 }, { width: 0, height: 0 })).toEqual({ width: 0, height: 0 })
    })

    it('says which ends of the strip hide someone', () => {
        expect(hiddenEnds({ scrollLeft: 0, clientWidth: 800, scrollWidth: 800 })).toEqual({
            before: false,
            after: false
        })
        expect(hiddenEnds({ scrollLeft: 0, clientWidth: 800, scrollWidth: 1378 })).toEqual({
            before: false,
            after: true
        })
        expect(hiddenEnds({ scrollLeft: 300, clientWidth: 800, scrollWidth: 1378 })).toEqual({
            before: true,
            after: true
        })
        expect(hiddenEnds({ scrollLeft: 577.5, clientWidth: 800, scrollWidth: 1378 })).toEqual({
            before: true,
            after: false
        })
        expect(hiddenEnds({ scrollLeft: 1, clientWidth: 800, scrollWidth: 1378 }).before).toBe(false)
    })

    it('can share a screen only where the browser has getDisplayMedia', () => {
        vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn() } })
        expect(canShareScreen()).toBe(true)
        vi.stubGlobal('navigator', { mediaDevices: {} })
        expect(canShareScreen()).toBe(false)
        vi.stubGlobal('navigator', {})
        expect(canShareScreen()).toBe(false)
    })
})
