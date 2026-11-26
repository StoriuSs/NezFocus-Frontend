/**
 * Whether this page was opened by reloading it: a duplicated tab or a new one
 * was not (D-51). A tab in a voice room or a call goes back into it only then.
 */
export function wasReloaded(): boolean {
    const [entry] = performance.getEntriesByType?.('navigation') ?? []
    return (entry as PerformanceNavigationTiming | undefined)?.type === 'reload'
}
