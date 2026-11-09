import { describe, it, expect } from 'vitest'
import i18n, { resources } from '@/i18n'
import { settingsResources } from '@/i18n/settings'
import { deletionResources } from '@/i18n/deletion'
import { serversResources } from '@/i18n/servers'

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
    it('has exactly the English keys in Vietnamese, in every namespace, the ones loaded with their pages too', () => {
        const all = (catalogue: Record<string, unknown>) =>
            Object.entries(catalogue)
                .flatMap(([namespace, entries]) => keysOf(entries, `${namespace}:`))
                .sort()
        expect(all(resources.vi)).toEqual(all(resources.en))
        expect(all({ settings: settingsResources.vi })).toEqual(all({ settings: settingsResources.en }))
        expect(all({ deletion: deletionResources.vi })).toEqual(all({ deletion: deletionResources.en }))
        expect(all({ servers: serversResources.vi })).toEqual(all({ servers: serversResources.en }))
    })

    it('adds the settings words to i18n once their pages load', async () => {
        await i18n.changeLanguage('vi')
        expect(i18n.t('settings:appearance.timeZone')).toBe('Múi giờ')
        await i18n.changeLanguage('en')
    })
})
