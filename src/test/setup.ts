import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Cleanup after each test
afterEach(() => {
    cleanup()
})

// Browser APIs jsdom lacks. Skipped in node-environment tests (build scripts).
if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn()
        }))
    })

    // A class, not vi.fn().mockImplementation(() => ({...})): under Vitest 4
    // an arrow-function mock can't be called with `new`, which is how every
    // consumer (Radix, react-easy-crop) creates one.
    globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    }

    // jsdom has no pointer capture; a toast (sonner, for swiping it away)
    // calls it on any press, such as on its "Undo" button.
    Element.prototype.setPointerCapture ??= () => undefined
    Element.prototype.releasePointerCapture ??= () => undefined
    Element.prototype.hasPointerCapture ??= () => false
    // Nor scrolling: an open Select (Radix) scrolls its chosen row into view.
    Element.prototype.scrollIntoView ??= () => undefined
}
