import { describe, expect, it } from 'vitest'
import { ATTACHMENT_MAX_BYTES, fileSize, kindOf, kindOfContent, middleOut, sortChosen } from '../lib/attachment-rules'

const file = (name: string, size = 100) =>
    new File([new Uint8Array(Math.min(size, 10))], name) as File & { size: number }
const sized = (name: string, size: number) => {
    const one = file(name)
    Object.defineProperty(one, 'size', { value: size })
    return one
}

describe('files chosen for a message (REQ-MSG-04, D-92, D-177)', () => {
    it('knows a file by its extension in any case, and refuses Windows scripts and executables', () => {
        expect(kindOf('Cau4.JPG')).toBe('image')
        expect(kindOf('de-giua-ky.pdf')).toBe('pdf')
        expect(kindOf('bang-diem.xlsx')).toBe('sheet')
        expect(kindOf('main.py')).toBe('text')
        for (const name of ['run.bat', 'a.ps1', 'setup.exe', 'Makefile', '.env']) expect(kindOf(name)).toBeNull()
    })

    it('shows a checked file by its content: an image that did not decode is a file like any other', () => {
        expect(kindOfContent('image/png', 'a.png')).toBe('image')
        expect(kindOfContent('text/plain; charset=utf-8', 'main.py')).toBe('text')
        expect(kindOfContent('application/zip', 'bai.zip')).toBe('archive')
    })

    it('keeps out empty files, those over 25 MB and those of a type not sent, and takes the first that fit in 10', () => {
        const sorted = sortChosen(
            [
                sized('rong.txt', 0),
                sized('bai-giang.mp4', ATTACHMENT_MAX_BYTES + 1),
                sized('virus.exe', 10),
                ...Array.from({ length: 9 }, (_, i) => sized(`anh${i}.png`, 10))
            ],
            3
        )
        expect(sorted.refused.map(({ file: one, why }) => [one.name, why])).toEqual([
            ['rong.txt', 'empty'],
            ['bai-giang.mp4', 'too-large'],
            ['virus.exe', 'unsupported']
        ])
        expect(sorted.taken.map((one) => one.name)).toEqual(Array.from({ length: 7 }, (_, i) => `anh${i}.png`))
        expect(sorted.leftOut).toBe(2)
        expect(sortChosen([sized('du.png', ATTACHMENT_MAX_BYTES)], 0).taken).toHaveLength(1)
    })

    it('says sizes as C-10 does: one decimal and the locale’s comma, at least 1 KB', () => {
        expect(fileSize(1.8 * 1024 * 1024, 'vi')).toBe('1,8 MB')
        expect(fileSize(1.8 * 1024 * 1024, 'en')).toBe('1.8 MB')
        expect(fileSize(640 * 1024, 'vi')).toBe('640 KB')
        expect(fileSize(12, 'vi')).toBe('1 KB')
    })

    it('cuts a long name in the middle, keeping its end', () => {
        expect(middleOut('de-giua-ky-2025.pdf', 14)).toBe('de-giu…025.pdf')
        expect(middleOut('ngan.pdf', 14)).toBe('ngan.pdf')
    })
})
