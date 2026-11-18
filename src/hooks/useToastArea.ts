import { useEffect, type RefObject } from 'react'
import { create } from 'zustand'

/**
 * Where a toast sits (C-16): at the bottom right of the content area, never
 * over the rail, the channel list or the right panel; 16 from its right edge,
 * 16 above the bar at the bottom of the page (the Composer; the room's
 * controls later), else 24 from the bottom; 8 above the "N new" button when it
 * shows; in the middle at the bottom below 1024.
 *
 * The page's parts say where they are (`useToastEdge`), in the window's
 * coordinates; the Toaster reads them (`toastPlace`).
 */

/**
 * The edges a toast follows: the content area's right, the top of the bottom
 * bar, the top of the "N new" button; and the inbox's right while it is open.
 */
export type ToastEdge = 'contentRight' | 'barTop' | 'liftTop' | 'panelRight'

type ToastEdges = Record<ToastEdge, number | null>

export const useToastArea = create<ToastEdges>(() => ({
    contentRight: null,
    barTop: null,
    liftTop: null,
    panelRight: null
}))

/**
 * The elements of each edge on the page now, the latest last. A right edge
 * follows the latest; a top edge the highest: two bars at the bottom (the
 * Composer over the room dock's strip below 1024, C-09) keep toasts above both.
 */
const elements = new Map<ToastEdge, HTMLElement[]>()

/**
 * Every edge read again, not only the one that changed: the Composer growing
 * moves the "N new" button up without changing its size.
 */
function measure() {
    const next: ToastEdges = { contentRight: null, barTop: null, liftTop: null, panelRight: null }
    for (const [edge, held] of elements) {
        const latest = held.at(-1)
        if (!latest) continue
        next[edge] =
            edge === 'contentRight' || edge === 'panelRight'
                ? latest.getBoundingClientRect().right
                : Math.min(...held.map((element) => element.getBoundingClientRect().top))
    }
    useToastArea.setState(next)
}

/** Keeps `edge` at the element's while it is on the page and `on`; let go once it leaves. */
export function useToastEdge(edge: ToastEdge, ref: RefObject<HTMLElement | null>, on = true): void {
    useEffect(() => {
        const element = ref.current
        if (!element || !on) return
        elements.set(edge, [...(elements.get(edge) ?? []), element])
        measure()
        // The element, and the page itself for the window's size: the shell fills the window.
        // (Not the window's event by name: Tailwind would read the word as a class for the first CSS.)
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
        observer?.observe(element)
        observer?.observe(document.documentElement)
        return () => {
            observer?.disconnect()
            // Others may hold the edge too (the Composer swapped for its locked line): only this one goes.
            elements.set(
                edge,
                (elements.get(edge) ?? []).filter((one) => one !== element)
            )
            measure()
        }
    }, [edge, ref, on])
}

/** Away from the window's edges on a page with nothing to follow. */
const CORNER = 24
/** From the content area's right and above the bottom bar. */
const GAP = 16
/** Above the "N new" button. */
const ABOVE_BUTTON = 8

export interface ToastPlace {
    position: 'bottom-right' | 'bottom-center'
    /** `left` only below 1024: in the middle, and across the window below 600 (Sonner), the same both sides. */
    offset: { left?: number; right: number; bottom: number }
}

/** Sonner's position and offsets for the edges now, in a window `viewport` large; `wide`: 1024 or more. */
export function toastPlace(edges: ToastEdges, viewport: { width: number; height: number }, wide: boolean): ToastPlace {
    const bottom =
        edges.liftTop !== null
            ? viewport.height - edges.liftTop + ABOVE_BUTTON
            : edges.barTop !== null
              ? viewport.height - edges.barTop + GAP
              : CORNER
    if (!wide) {
        return edges.panelRight === null
            ? { position: 'bottom-center', offset: { left: CORNER, right: CORNER, bottom } }
            : { position: 'bottom-right', offset: { right: GAP, bottom } }
    }
    const right = edges.contentRight === null ? CORNER : viewport.width - edges.contentRight + GAP
    return { position: 'bottom-right', offset: { right, bottom } }
}
