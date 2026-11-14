import { describe, expect, it } from 'vitest'
import { parseMessage, plainText, type Block, type Inline } from '../lib/markdown'

const text = (value: string): Inline => ({ type: 'text', text: value })
const paragraph = (...children: Inline[]): Block => ({ type: 'paragraph', children })

/** The inline parts of a message that is one paragraph. */
function inline(message: string): Inline[] {
    const blocks = parseMessage(message)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type).toBe('paragraph')
    return (blocks[0] as Extract<Block, { type: 'paragraph' }>).children
}

describe('parseMessage, inline formatting (REQ-MSG-02)', () => {
    it('keeps plain text as it is, line breaks included', () => {
        expect(parseMessage('Câu 3 làm sao?\nMình kẹt rồi')).toEqual([paragraph(text('Câu 3 làm sao?\nMình kẹt rồi'))])
    })

    it('reads bold, italic with * or _, and strikethrough', () => {
        expect(inline('**Tóm tắt** *tọa độ cực* _gấp_ ~~sai~~')).toEqual([
            { type: 'bold', children: [text('Tóm tắt')] },
            text(' '),
            { type: 'italic', children: [text('tọa độ cực')] },
            text(' '),
            { type: 'italic', children: [text('gấp')] },
            text(' '),
            { type: 'strike', children: [text('sai')] }
        ])
    })

    it('nests them: ***both***, and bold inside italic', () => {
        expect(inline('***cả hai***')).toEqual([
            { type: 'bold', children: [{ type: 'italic', children: [text('cả hai')] }] }
        ])
        expect(inline('*a **b** c*')).toEqual([
            { type: 'italic', children: [text('a '), { type: 'bold', children: [text('b')] }, text(' c')] }
        ])
    })

    it('leaves markers that open or close on a space, or underscores inside a word', () => {
        expect(inline('2 * 3 * 4')).toEqual([text('2 * 3 * 4')])
        expect(inline('ten_bien_moi và **')).toEqual([text('ten_bien_moi và **')])
        expect(inline('**chưa đóng')).toEqual([text('**chưa đóng')])
    })

    it('reads inline code literally, markers and links included', () => {
        expect(inline('đặt `x = r cos φ` nhé')).toEqual([
            text('đặt '),
            { type: 'code', text: 'x = r cos φ' },
            text(' nhé')
        ])
        expect(inline('`**a** https://a.vn`')).toEqual([{ type: 'code', text: '**a** https://a.vn' }])
        expect(inline('``có ` bên trong``')).toEqual([{ type: 'code', text: 'có ` bên trong' }])
    })

    it('takes a backslash as "this character, not a marker"', () => {
        expect(inline('\\*không nghiêng\\* và \\\\')).toEqual([text('*không nghiêng* và \\')])
        expect(inline('C:\\Users')).toEqual([text('C:\\Users')])
    })

    it('shows HTML as text: nothing is ever HTML', () => {
        expect(inline('<b>x</b> <img src=x onerror=alert(1)>')).toEqual([text('<b>x</b> <img src=x onerror=alert(1)>')])
    })
})

describe('parseMessage, links (REQ-MSG-02, REQ-MSG-05)', () => {
    it('links http and https addresses, without the punctuation after them', () => {
        expect(inline('Xem https://tailieu.ptit.edu.vn/giai-tich-2.')).toEqual([
            text('Xem '),
            { type: 'link', href: 'https://tailieu.ptit.edu.vn/giai-tich-2' },
            text('.')
        ])
        expect(inline('(http://a.vn/x?y=1)')).toEqual([
            text('('),
            { type: 'link', href: 'http://a.vn/x?y=1' },
            text(')')
        ])
    })

    it('keeps a closing parenthesis that belongs to the address', () => {
        expect(inline('https://vi.wikipedia.org/wiki/T%C3%ADch_(to%C3%A1n)')).toEqual([
            { type: 'link', href: 'https://vi.wikipedia.org/wiki/T%C3%ADch_(to%C3%A1n)' }
        ])
    })

    it('never links javascript: or any other scheme (D-117)', () => {
        expect(inline('javascript:alert(1)')).toEqual([text('javascript:alert(1)')])
        expect(inline('[bấm](javascript:alert(1))')).toEqual([text('[bấm](javascript:alert(1))')])
        expect(inline('data:text/html,x ftp://a.vn')).toEqual([text('data:text/html,x ftp://a.vn')])
    })

    it('links inside formatting, not across it', () => {
        expect(inline('**https://a.vn**')).toEqual([
            { type: 'bold', children: [{ type: 'link', href: 'https://a.vn' }] }
        ])
    })
})

describe('parseMessage, blocks (REQ-MSG-02)', () => {
    it('reads a code block, dropping a first line that only names the language', () => {
        expect(parseMessage('Lời giải:\n```js\nconst x = 1\n**y**\n```\nXong')).toEqual([
            paragraph(text('Lời giải:')),
            { type: 'codeBlock', text: 'const x = 1\n**y**' },
            paragraph(text('Xong'))
        ])
        expect(parseMessage('```\n∬_D (x² + y²) dA\n```')).toEqual([{ type: 'codeBlock', text: '∬_D (x² + y²) dA' }])
        expect(parseMessage('```một dòng```')).toEqual([{ type: 'codeBlock', text: 'một dòng' }])
    })

    it('keeps a code fence never closed as text', () => {
        expect(parseMessage('```js\nchưa đóng')).toEqual([paragraph(text('```js\nchưa đóng'))])
    })

    it('groups lines starting with "> " into one quote', () => {
        expect(parseMessage('> Nhớ đổi cận\n> theo góc **phần tư**\nRồi tính')).toEqual([
            {
                type: 'quote',
                children: [text('Nhớ đổi cận\ntheo góc '), { type: 'bold', children: [text('phần tư')] }]
            },
            paragraph(text('Rồi tính'))
        ])
        expect(parseMessage('>không cách')).toEqual([paragraph(text('>không cách'))])
    })
})

describe('plainText', () => {
    it('is what the message says, markers left out: read aloud and quoted in reply lines', () => {
        expect(plainText('**Tóm tắt** `x`\n> nhớ _đổi_\n```\ncode\n```')).toBe('Tóm tắt x\nnhớ đổi\ncode')
    })
})
