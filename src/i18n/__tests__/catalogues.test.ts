import { describe, it, expect } from 'vitest'
import { resources } from '@/i18n'

/** Every leaf key, dotted and namespaced: { a: { b: 'x' } } in "ns" -> ['ns:a.b']. */
function keysOf(value: unknown, prefix: string): string[] {
    if (typeof value !== 'object' || value === null) return [prefix]
    return Object.entries(value).flatMap(([key, child]) =>
        keysOf(child, prefix.endsWith(':') ? prefix + key : `${prefix}.${key}`)
    )
}

describe('translation catalogues', () => {
    // t() is typed against English; this keeps Vietnamese from silently
    // falling back to English (or showing a raw key) for anything added later.
    it('has exactly the English keys in Vietnamese, in every namespace', () => {
        const all = (catalogue: Record<string, unknown>) =>
            Object.entries(catalogue)
                .flatMap(([namespace, entries]) => keysOf(entries, `${namespace}:`))
                .sort()
        expect(all(resources.vi)).toEqual(all(resources.en))
    })
})
