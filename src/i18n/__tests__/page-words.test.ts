// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The namespaces that load with their pages (i18n.md › Words that load with
// their pages): a module using their words imports the module adding them, or
// the words are missing whenever it loads before the other users. These tests
// name the module that forgot.

const src = resolve(__dirname, '../..')
const LAZY = ['settings', 'deletion', 'servers', 'messaging'] as const

/** The code without its comments: words named in a comment are not a use, nor is an import there. */
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')

const q = `['"\`]`
/** The ways a module reads a namespace's words: `useTranslation`, a `ns:` prefix or option, `<Trans ns>`, `getFixedT`, a typed `t`. */
const uses = (code: string, ns: string) =>
    [
        `useTranslation\\(\\s*\\[?[^)]*${q}${ns}${q}`,
        `${q}${ns}:`,
        `\\bns\\s*[:=]\\s*\\{?\\s*\\[?[^\\]}]*${q}${ns}${q}`,
        `getFixedT\\([^)]*${q}${ns}${q}`,
        `TFunction<\\s*${q}${ns}${q}`
    ].some((pattern) => new RegExp(pattern).test(code))

const imports = (code: string, ns: string) => new RegExp(`^import ${q}@/i18n/${ns}${q}`, 'm').test(code)

const sources = readdirSync(src, { recursive: true, encoding: 'utf8' })
    .map((file) => file.replace(/\\/g, '/'))
    .filter((file) => /\.tsx?$/.test(file) && !file.includes('__tests__') && !file.startsWith('i18n/'))
    .map((file) => ({ file, code: withoutComments(readFileSync(join(src, file), 'utf8')) }))

describe('words that load with their pages', () => {
    it('sees every way of reading the words, and not words in a comment', () => {
        const read = [
            "useTranslation('servers')",
            "useTranslation(['common', 'servers'])",
            'useTranslation("servers")',
            "t('servers:join.title')",
            "t('join.title', { ns: 'servers' })",
            "<Trans ns='servers' i18nKey='banner' />",
            "<Trans ns={['servers']} i18nKey='banner' />",
            "i18n.getFixedT(null, 'servers')",
            "type T = TFunction<'servers'>"
        ]
        for (const code of read) expect(uses(withoutComments(code), 'servers'), code).toBe(true)
        const notRead = ["// see 'servers:join.title'", "/* useTranslation('servers') */", "useTranslation('serversx')"]
        for (const code of notRead) expect(uses(withoutComments(code), 'servers'), code).toBe(false)
        expect(imports(withoutComments("// import '@/i18n/servers'"), 'servers')).toBe(false)
        expect(withoutComments("const url = 'https://cdn.test/a'")).toContain('https://cdn.test/a')
    })

    it.each(LAZY)('every module using the %s words imports the module adding them', (ns) => {
        const users = sources.filter(({ code }) => uses(code, ns))
        expect(users.length).toBeGreaterThan(0)
        const forgot = users.filter(({ code }) => !imports(code, ns)).map(({ file }) => file)
        expect(forgot, `modules missing import '@/i18n/${ns}'`).toEqual([])
    })
})
