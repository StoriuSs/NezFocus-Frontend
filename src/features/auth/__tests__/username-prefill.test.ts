import { describe, it, expect } from 'vitest'
import { usernameFromEmail } from '@/features/auth/lib/username-prefill'

describe('the username "complete your account" starts with', () => {
    it('is the part before @, in lower case', () => {
        expect(usernameFromEmail('An.Nguyen@gmail.com')).toBe('an.nguyen')
    })

    it('drops what a username cannot have, and stops at 32 characters', () => {
        expect(usernameFromEmail('nguyễn+thi-an@gmail.com')).toBe('nguynthian')
        expect(usernameFromEmail('nguyen.thi.thanh.an.d22cqcn04.hn@stu.ptit.edu.vn')).toBe(
            'nguyen.thi.thanh.an.d22cqcn04.hn'
        )
        expect(usernameFromEmail(`${'a'.repeat(40)}@x.vn`)).toHaveLength(32)
    })

    it('is empty when less than two characters are left, or there is no email', () => {
        expect(usernameFromEmail('a@gmail.com')).toBe('')
        expect(usernameFromEmail('đ+@gmail.com')).toBe('')
        expect(usernameFromEmail(undefined)).toBe('')
    })
})
