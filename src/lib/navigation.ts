/** A full page load. A module of its own so tests can observe it (jsdom can't navigate). */
export function hardNavigate(url: string): void {
    window.location.assign(url)
}
