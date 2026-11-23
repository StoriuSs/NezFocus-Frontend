// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, '..', 'fonts.css'), 'utf8')

/** The code points of a `unicode-range` ("U+0030-0039,U+003A"), each range as [from, to]. */
function rangesOf(rule: string): [number, number][] {
    const list = /unicode-range:\s*([^;]+);/.exec(rule)?.[1] ?? ''
    return list.split(',').map((part) => {
        const [from, to] = part.trim().replace(/^U\+/i, '').split('-')
        return [parseInt(from ?? '', 16), parseInt(to ?? from ?? '', 16)]
    })
}

const covers = (ranges: [number, number][], char: string) => {
    const code = char.codePointAt(0) ?? -1
    return ranges.some(([from, to]) => code >= from && code <= to)
}

describe('the numbers font (DESIGN.md › Typography, 08 › Quy ước › Số)', () => {
    const unbounded = css.split('@font-face').filter((rule) => rule.includes("font-family: 'Unbounded'"))

    it('draws digits and the signs between them, never a letter: words stay in Be Vietnam Pro', () => {
        expect(unbounded).toHaveLength(1)
        const ranges = rangesOf(unbounded[0] ?? '')
        for (const char of '0123456789:/+−%·') expect(covers(ranges, char), char).toBe(true)
        // Its Latin file only: a word set with it ("dưới 1 phút", "86 giờ") took ư, ơ, ờ from another font.
        for (const char of 'agiophútdưới giờAZéÀ') {
            if (char !== ' ') expect(covers(ranges, char), char).toBe(false)
        }
    })
})
