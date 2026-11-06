import { describe, it, expect } from 'vitest'
import { parseInline, parseMarkdown } from '@/lib/simple-markdown'

describe('the Markdown of the legal pages', () => {
    it('reads the title, the line under it, numbered sections, paragraphs and lists', () => {
        const blocks = parseMarkdown(
            '# Terms\n\nLast updated: 01/11/2026\n\nBy using it you agree.\n\n## 4. Conduct\n\nYou must not:\n\n- Harass anyone.\n- Send spam.\n'
        )
        expect(blocks).toEqual([
            { type: 'title', text: 'Terms' },
            { type: 'meta', text: 'Last updated: 01/11/2026' },
            { type: 'paragraph', content: [{ type: 'text', text: 'By using it you agree.' }] },
            { type: 'heading', text: '4. Conduct', id: '4' },
            { type: 'paragraph', content: [{ type: 'text', text: 'You must not:' }] },
            {
                type: 'list',
                items: [[{ type: 'text', text: 'Harass anyone.' }], [{ type: 'text', text: 'Send spam.' }]]
            }
        ])
    })

    it('gives an unnumbered section an id from its words, without accents', () => {
        expect(parseMarkdown('## Liên hệ')).toEqual([{ type: 'heading', text: 'Liên hệ', id: 'lien-he' }])
    })

    it('reads bold and links, and keeps a link that could run script as plain text', () => {
        expect(parseInline('**Email:** write to [us](mailto:a@b.vn) or [here](/privacy).')).toEqual([
            { type: 'bold', text: 'Email:' },
            { type: 'text', text: ' write to ' },
            { type: 'link', text: 'us', href: 'mailto:a@b.vn' },
            { type: 'text', text: ' or ' },
            { type: 'link', text: 'here', href: '/privacy' },
            { type: 'text', text: '.' }
        ])
        expect(parseInline('[click](javascript:alert(1))')[0]).toEqual({ type: 'text', text: 'click' })
        expect(parseInline('[away](//evil.example)')).toEqual([{ type: 'text', text: 'away' }])
    })
})
