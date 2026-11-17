import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { act, render } from '@testing-library/react'
import { toastPlace, useToastArea, useToastEdge, type ToastEdge } from '../useToastArea'

const VIEWPORT = { width: 1440, height: 900 }
const NONE = { contentRight: null, barTop: null, liftTop: null, panelRight: null }

describe('Where a toast sits (C-16)', () => {
    it('sits 24 from the corner of the window on a page with no content area to follow', () => {
        expect(toastPlace(NONE, VIEWPORT, true)).toEqual({
            position: 'bottom-right',
            offset: { right: 24, bottom: 24 }
        })
    })

    it('keeps 16 from the right of the content area, so it never covers the right panel', () => {
        // Content from 312 to 1160, the members panel after it.
        const place = toastPlace({ ...NONE, contentRight: 1160 }, VIEWPORT, true)
        expect(place.offset.right).toBe(1440 - 1160 + 16)
    })

    it('sits 16 above the bar at the bottom of the page (the composer), else 24 from the bottom', () => {
        expect(toastPlace({ ...NONE, barTop: 820 }, VIEWPORT, true).offset.bottom).toBe(900 - 820 + 16)
        expect(toastPlace(NONE, VIEWPORT, true).offset.bottom).toBe(24)
    })

    it('sits 8 above the "N new" button when it shows (06 message-deleted)', () => {
        expect(toastPlace({ ...NONE, barTop: 820, liftTop: 760 }, VIEWPORT, true).offset.bottom).toBe(900 - 760 + 8)
    })

    it('sits in the middle at the bottom below 1024, still above the composer', () => {
        expect(toastPlace({ ...NONE, contentRight: 768, barTop: 820 }, { width: 768, height: 900 }, false)).toEqual({
            position: 'bottom-center',
            offset: { left: 24, right: 24, bottom: 900 - 820 + 16 }
        })
    })

    it('goes to the bottom right of the window below 1024 while the inbox is open, off its middle (06 toast-768)', () => {
        expect(
            toastPlace({ ...NONE, contentRight: 768, barTop: 820, panelRight: 520 }, { width: 768, height: 900 }, false)
        ).toEqual({
            position: 'bottom-right',
            offset: { right: 16, bottom: 900 - 820 + 16 }
        })
    })
})

/** A box at fixed place in the window, as getBoundingClientRect reports it. */
function box(element: HTMLElement | null, rect: { top: number; right: number }) {
    if (element) element.getBoundingClientRect = () => ({ ...rect, left: 0, bottom: rect.top + 40 }) as DOMRect
}

function Edge({ edge, rect, on = true }: { edge: ToastEdge; rect: { top: number; right: number }; on?: boolean }) {
    const ref = useRef<HTMLDivElement>(null)
    useToastEdge(edge, ref, on)
    return <div ref={(element) => (box(element, rect), void (ref.current = element))} />
}

describe('The edges a toast follows', () => {
    afterEach(() => useToastArea.setState(NONE))

    it('keeps each edge of the elements on the page, and lets go of one gone', () => {
        const view = render(
            <>
                <Edge edge='contentRight' rect={{ top: 0, right: 1160 }} />
                <Edge edge='barTop' rect={{ top: 820, right: 1144 }} />
            </>
        )
        expect(useToastArea.getState()).toMatchObject({ contentRight: 1160, barTop: 820, liftTop: null })

        view.rerender(<Edge edge='contentRight' rect={{ top: 0, right: 1160 }} />)
        expect(useToastArea.getState()).toMatchObject({ contentRight: 1160, barTop: null })
    })

    it('measures every edge again when the window changes: one moved without changing size', () => {
        let barTop = 820
        function Bar() {
            const ref = useRef<HTMLDivElement>(null)
            useToastEdge('barTop', ref)
            return (
                <div
                    ref={(element) => {
                        if (element) element.getBoundingClientRect = () => ({ top: barTop, right: 0 }) as DOMRect
                        ref.current = element
                    }}
                />
            )
        }
        // What the hook observes: the element, and the page for the window's size.
        const observers: { notify: () => void; watched: Element[] }[] = []
        vi.stubGlobal(
            'ResizeObserver',
            class {
                watched: Element[] = []
                constructor(callback: () => void) {
                    observers.push({ notify: callback, watched: this.watched })
                }
                observe(target: Element) {
                    this.watched.push(target)
                }
                disconnect() {}
            }
        )
        render(<Bar />)
        expect(observers[0]!.watched).toContain(document.documentElement)

        barTop = 700
        act(() => observers[0]!.notify())
        expect(useToastArea.getState().barTop).toBe(700)
        vi.unstubAllGlobals()
    })

    it('follows an element only while asked to (the "N new" button shows)', () => {
        const view = render(<Edge edge='liftTop' rect={{ top: 760, right: 1144 }} on={false} />)
        expect(useToastArea.getState().liftTop).toBeNull()
        view.rerender(<Edge edge='liftTop' rect={{ top: 760, right: 1144 }} on />)
        expect(useToastArea.getState().liftTop).toBe(760)
    })
})
