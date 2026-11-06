import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn', () => {
    it('keeps a design-system font size next to a colour', () => {
        expect(cn('text-body-sm', 'text-text-secondary')).toBe('text-body-sm text-text-secondary')
        expect(cn('text-label font-semibold', 'text-danger')).toBe('text-label font-semibold text-danger')
    })

    it('still lets a later class of the same kind win', () => {
        expect(cn('text-body-sm', 'text-headline')).toBe('text-headline')
        expect(cn('text-text-secondary', 'text-text-primary')).toBe('text-text-primary')
        expect(cn('bg-surface-1 rounded-input', 'bg-surface-2')).toBe('rounded-input bg-surface-2')
    })
})
