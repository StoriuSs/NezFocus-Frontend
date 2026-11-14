import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import '@/i18n/messaging'
import {
    buildGroups,
    fold,
    normaliseEmoji,
    normaliseLoosely,
    pickerSections,
    searchEmoji,
    type RawEmoji
} from '../lib/emoji-data'
import { moveInGrid } from '../lib/emoji-grid'
import { DEFAULT_RECENT, readRecent, RECENT_MAX, rememberEmoji } from '../lib/emoji-recent'
import { reactorsLabel } from '../lib/reactors-label'

const raw = (emoji: string, label: string, group: number | undefined, order: number, more: Partial<RawEmoji> = {}) =>
    ({ emoji, label, group, order, version: 1, tags: [], ...more }) as RawEmoji

describe('The emoji picker’s data (C-12, SRS 1.71)', () => {
    it('keeps one standard form per emoji, as the server does: a variation selector it lacks is dropped', () => {
        expect(normaliseEmoji('👍\u{FE0F}')).toBe('👍')
        expect(normaliseEmoji('❤️')).toBe('❤️')
        expect(normaliseEmoji('👨‍👩‍👧')).toBe('👨‍👩‍👧')
        expect(normaliseEmoji('a')).toBeNull()
    })

    it('keeps the same form on a browser that cannot read standard emoji sets (no regex `v` flag)', () => {
        // Checked against \p{RGI_Emoji} for all 7,632 emoji and skins of emojibase-data 16.0.3.
        expect(normaliseLoosely('👍\u{FE0F}')).toBe('👍')
        expect(normaliseLoosely('👍🏽')).toBe('👍🏽')
        expect(normaliseLoosely('❤️')).toBe('❤️')
        expect(normaliseLoosely('🏳️‍🌈')).toBe('🏳️‍🌈')
        expect(normaliseLoosely('👁️‍🗨️')).toBe('👁️‍🗨️')
    })

    it('shows "Recently used" and every group, or only the matches of a search', () => {
        const groups = buildGroups([raw('😀', 'mặt cười', 0, 0), raw('🐶', 'mặt chó', 3, 1)])
        const t = i18n.getFixedT('vi', 'messaging')
        expect(pickerSections(groups, '', ['🐶', '🎉'], t).map((section) => [section.title, section.emojis])).toEqual([
            [
                'Dùng gần đây',
                [
                    { emoji: '🐶', label: 'mặt chó' },
                    { emoji: '🎉', label: '🎉' }
                ]
            ],
            ['Mặt cười & cảm xúc', [expect.objectContaining({ emoji: '😀' })]],
            ['Động vật & thiên nhiên', [expect.objectContaining({ emoji: '🐶' })]]
        ])
        expect(pickerSections(groups, 'cho', [], t).map((section) => section.title)).toEqual(['Kết quả'])
        expect(pickerSections(groups, 'xyz', [], t)).toEqual([])
    })

    it('groups emoji in order, leaving out skin tone pieces, emoji with no group and those newer than 15.0', () => {
        const groups = buildGroups([
            raw('😀', 'mặt cười', 0, 2),
            raw('🙂', 'mặt hơi cười', 0, 1),
            raw('🏻', 'màu da sáng', 2, 3),
            raw('🇦', 'chỉ thị khu vực A', undefined, 0),
            raw('🫨', 'mặt rung', 0, 4, { version: 15 }),
            raw('🙂‍↔️', 'lắc đầu', 0, 5, { version: 15.1 }),
            raw('👍\u{FE0F}', 'thích', 1, 6)
        ])
        expect(groups.map((group) => [group.key, group.emojis.map((item) => item.emoji)])).toEqual([
            ['smileys-emotion', ['🙂', '😀', '🫨']],
            ['people-body', ['👍']]
        ])
    })

    it('finds emoji by their name or tags without accents (C-12 › Luật)', () => {
        const groups = buildGroups([
            raw('😀', 'mặt cười', 0, 0, { tags: ['vui'] }),
            raw('🐶', 'mặt chó', 3, 1, { tags: ['thú cưng'] }),
            raw('🥳', 'mặt dự tiệc', 0, 2)
        ])
        expect(searchEmoji(groups, 'cuoi').map((item) => item.emoji)).toEqual(['😀'])
        expect(searchEmoji(groups, 'MAT').map((item) => item.emoji)).toEqual(['😀', '🥳', '🐶'])
        expect(searchEmoji(groups, 'thu cung').map((item) => item.emoji)).toEqual(['🐶'])
        expect(searchEmoji(groups, 'uoi')).toEqual([])
        expect(fold('Đề Cương')).toBe('de cuong')
    })
})

describe('Recently used emoji, per person in this browser (SRS 1.71)', () => {
    beforeEach(() => window.localStorage.clear())

    it('shows the frame’s eight until one picks any, then the newest first, each once, at most 16', () => {
        expect(readRecent('an')).toEqual(DEFAULT_RECENT)
        rememberEmoji('an', '🔥')
        rememberEmoji('an', '👍')
        rememberEmoji('an', '🔥')
        expect(readRecent('an')).toEqual(['🔥', '👍'])
        expect(readRecent('binh')).toEqual(DEFAULT_RECENT)

        const many = [...'😀😁😂🤣😃😄😅😆😉😊😋😎😍😘🥰😗😙']
        many.forEach((emoji) => rememberEmoji('an', emoji))
        expect(readRecent('an')).toHaveLength(RECENT_MAX)
        expect(readRecent('an')[0]).toBe('😙')
    })

    it('reads a damaged list as none, and remembers nothing without a person', () => {
        window.localStorage.setItem('emoji-recent:an', '{oops')
        expect(readRecent('an')).toEqual(DEFAULT_RECENT)
        window.localStorage.setItem('emoji-recent:an', JSON.stringify([1, '👍']))
        expect(readRecent('an')).toEqual(['👍'])
        rememberEmoji(undefined, '👍')
        expect(window.localStorage.length).toBe(1)
    })
})

describe('Moving in the emoji grid with arrow keys (8 columns, one block per group)', () => {
    // Two groups: 10 emoji (rows of 8 and 2), then 5.
    const sizes = [10, 5]

    it('moves left and right through the groups, in order', () => {
        expect(moveInGrid(sizes, { group: 0, index: 9 }, 'ArrowRight')).toEqual({ group: 1, index: 0 })
        expect(moveInGrid(sizes, { group: 1, index: 0 }, 'ArrowLeft')).toEqual({ group: 0, index: 9 })
        expect(moveInGrid(sizes, { group: 1, index: 4 }, 'ArrowRight')).toEqual({ group: 1, index: 4 })
        expect(moveInGrid(sizes, { group: 0, index: 0 }, 'ArrowLeft')).toEqual({ group: 0, index: 0 })
    })

    it('moves down a row in the same column, onto the last emoji of a shorter row, then into the next group', () => {
        expect(moveInGrid(sizes, { group: 0, index: 1 }, 'ArrowDown')).toEqual({ group: 0, index: 9 })
        expect(moveInGrid(sizes, { group: 0, index: 6 }, 'ArrowDown')).toEqual({ group: 0, index: 9 })
        expect(moveInGrid(sizes, { group: 0, index: 9 }, 'ArrowDown')).toEqual({ group: 1, index: 1 })
        expect(moveInGrid(sizes, { group: 1, index: 3 }, 'ArrowDown')).toEqual({ group: 1, index: 3 })
    })

    it('moves up a row, into the last row of the group before, and from the first row to the search box', () => {
        expect(moveInGrid(sizes, { group: 0, index: 9 }, 'ArrowUp')).toEqual({ group: 0, index: 1 })
        expect(moveInGrid(sizes, { group: 1, index: 1 }, 'ArrowUp')).toEqual({ group: 0, index: 9 })
        expect(moveInGrid(sizes, { group: 1, index: 0 }, 'ArrowUp')).toEqual({ group: 0, index: 8 })
        expect(moveInGrid(sizes, { group: 0, index: 3 }, 'ArrowUp')).toBe('search')
        expect(moveInGrid(sizes, { group: 0, index: 3 }, 'Enter')).toBeNull()
    })
})

describe('Who gave an emoji, in its chip’s Tooltip (C-10 ReactionChip, SRS 1.71)', () => {
    const vi = i18n.getFixedT('vi', 'messaging')
    const en = i18n.getFixedT('en', 'messaging')
    const user = (id: string, displayName: string | null, username = id) => ({ id, username, displayName })

    it('names the first three and counts the others', () => {
        const users = [user('binh', 'Bình'), user('chi', 'Chi'), user('dung', null, 'dung.pham')]
        expect(reactorsLabel({ users, count: 8 }, '👍', 8, 'an', vi)).toBe(
            'Bình, Chi, dung.pham và 5 người khác đã thả 👍'
        )
        expect(reactorsLabel({ users, count: 3 }, '👍', 3, 'an', vi)).toBe('Bình, Chi và dung.pham đã thả 👍')
        expect(reactorsLabel({ users: users.slice(0, 1), count: 1 }, '🎉', 1, 'an', vi)).toBe('Bình đã thả 🎉')
        expect(reactorsLabel({ users, count: 4 }, '👍', 4, 'an', en)).toBe(
            'Bình, Chi, dung.pham, and 1 other reacted with 👍'
        )
    })

    it('names a deleted account as such', () => {
        const users = [user('binh', 'Bình'), { id: 'gone', username: null, displayName: null }]
        expect(reactorsLabel({ users, count: 2 }, '👍', 2, 'an', vi)).toBe('Bình và Tài khoản đã bị xóa đã thả 👍')
    })

    it('says "you" for the person reading, and only how many before the names are read', () => {
        const users = [user('an', 'An'), user('binh', 'Bình')]
        expect(reactorsLabel({ users, count: 2 }, '👍', 2, 'an', vi)).toBe('Bạn và Bình đã thả 👍')
        expect(reactorsLabel(undefined, '👍', 5, 'an', vi)).toBe('5 người đã thả 👍')
        expect(reactorsLabel(undefined, '👍', 1, 'an', en)).toBe('1 person reacted with 👍')
    })
})
