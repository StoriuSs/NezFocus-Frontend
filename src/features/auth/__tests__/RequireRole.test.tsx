import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { mockAuthStore } from '@/test/helpers'

const state = { user: null as { roles: string[] } | null }
vi.mock('@/features/auth/auth.store', () => mockAuthStore(state))

const { RequireRole } = await import('@/features/auth/components/RequireRole')

describe('RequireRole', () => {
    beforeEach(() => {
        state.user = { roles: ['user'] }
    })

    it('shows its children only to users with the role, the fallback to anyone else', () => {
        const { rerender } = render(
            <RequireRole role='admin' fallback='Not allowed'>
                Admin area
            </RequireRole>
        )
        expect(screen.queryByText('Admin area')).not.toBeInTheDocument()
        expect(screen.getByText('Not allowed')).toBeInTheDocument()

        rerender(<RequireRole role='user'>Members area</RequireRole>)
        expect(screen.getByText('Members area')).toBeInTheDocument()

        state.user = null
        rerender(<RequireRole role='user'>Members area again</RequireRole>)
        expect(screen.queryByText('Members area again')).not.toBeInTheDocument()
    })
})
