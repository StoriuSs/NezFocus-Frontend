import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, useRef } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import i18n from '@/i18n'
import { apiError } from '@/test/helpers'
import type { UserProfile } from '@/features/users/types'

const api = { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() }
vi.mock('@/lib/api', () => ({ default: api }))
// jsdom draws no images: the cropper reports its area at once, the crop is a fixed Blob.
vi.mock('react-easy-crop', () => ({
    // Like the real one, it reports the area once the image has loaded.
    default: function MockCropper({ onCropComplete }: { onCropComplete: (area: object, pixels: object) => void }) {
        const loaded = useRef(false)
        useEffect(() => {
            if (loaded.current) return
            loaded.current = true
            onCropComplete({}, { x: 0, y: 0, width: 280, height: 280 })
        }, [onCropComplete])
        return <div data-testid='cropper' />
    }
}))
vi.mock('@/features/users/lib/crop-image', () => ({ default: () => Promise.resolve(new Blob(['jpeg'])) }))

const { default: Profile } = await import('@/features/users/pages/Profile')
const { AVATAR_UNDO_MS } = await import('@/features/users/lib/avatar-removal')
const { flushBeforeSignOut, setTokenSource } = await import('@/lib/before-sign-out')

const saved: UserProfile = {
    id: 'user-1',
    email: 'an.nguyen@example.test',
    username: 'an.nguyen',
    displayName: 'An',
    bio: 'Ôn Giải tích 2 mỗi tối 21:00',
    avatarUrl: null,
    roles: ['user'],
    completed: true,
    deletesAt: null
}

function GoToAccount() {
    const navigate = useNavigate()
    return (
        <button type='button' onClick={() => void navigate('/settings/account')}>
            Account page
        </button>
    )
}

function renderProfile(profile: Partial<UserProfile> = {}) {
    api.get.mockResolvedValue({ data: { data: { ...saved, ...profile } } })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const router = createMemoryRouter(
        [
            {
                path: '/settings/profile',
                element: (
                    <>
                        <GoToAccount />
                        <Profile />
                    </>
                )
            },
            { path: '/settings/account', element: <h1>Account</h1> }
        ],
        { initialEntries: ['/settings/profile'] }
    )
    render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
            <Toaster />
        </QueryClientProvider>
    )
    return router
}

const nameField = () => screen.findByLabelText('Display name')
const bioField = () => screen.getByLabelText('Bio')
const saveBar = () => screen.queryByText('You have unsaved changes')

beforeEach(async () => {
    await i18n.changeLanguage('en')
    for (const call of Object.values(api)) call.mockReset()
    api.patch.mockResolvedValue({ data: { data: null } })
    api.delete.mockResolvedValue({ data: { data: null } })
    api.post.mockResolvedValue({ data: { data: null } })
})

afterEach(() => {
    vi.useRealTimers()
})

describe('the profile page (S-ME-02)', () => {
    it('shows the profile with its counters, and the save bar only while something changed', async () => {
        const user = userEvent.setup()
        renderProfile()

        expect(await nameField()).toHaveValue('An')
        expect(screen.getByText('2/32')).toBeInTheDocument()
        expect(screen.getByText('28/200')).toBeInTheDocument()
        expect(screen.getByLabelText('Username')).toHaveAttribute('readonly')
        expect(saveBar()).not.toBeInTheDocument()

        await user.type(bioField(), ' 🙂')
        expect(screen.getByText('30/200')).toBeInTheDocument()
        expect(saveBar()).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Discard changes' }))
        expect(bioField()).toHaveValue(saved.bio)
        expect(saveBar()).not.toBeInTheDocument()
    })

    it('saves both fields, composed and trimmed, then hides the bar', async () => {
        const user = userEvent.setup()
        renderProfile()
        const name = await nameField()

        await user.clear(name)
        await user.type(name, '  Nguyễn An ')
        await user.click(screen.getByRole('button', { name: 'Save changes' }))

        await waitFor(() =>
            expect(api.patch).toHaveBeenCalledWith(
                '/users/me',
                { displayName: 'Nguyễn An', bio: saved.bio },
                expect.objectContaining({ headers: { 'Idempotency-Key': expect.any(String) } })
            )
        )
        expect(await screen.findByText('Profile updated')).toBeInTheDocument()
        await waitFor(() => expect(saveBar()).not.toBeInTheDocument())
    })

    it('refuses a name that would look empty, at the field, without asking the API', async () => {
        const user = userEvent.setup()
        renderProfile()
        const name = await nameField()

        await user.clear(name)
        await user.type(name, 'ㅤㅤ')
        await user.click(screen.getByRole('button', { name: 'Save changes' }))

        expect(await screen.findByText('Enter a display name')).toBeInTheDocument()
        expect(name).toHaveFocus()
        expect(api.patch).not.toHaveBeenCalled()
    })

    it('keeps what was typed when the save fails', async () => {
        const user = userEvent.setup()
        api.patch.mockRejectedValue(apiError(503, 'SERVICE_UNAVAILABLE_ERROR'))
        renderProfile()

        await user.type(await nameField(), ' Lê')
        await user.click(screen.getByRole('button', { name: 'Save changes' }))

        await waitFor(() => expect(api.patch).toHaveBeenCalled())
        expect(await nameField()).toHaveValue('An Lê')
        expect(saveBar()).toBeInTheDocument()
    })

    it('saves with Ctrl+Enter in the bio', async () => {
        const user = userEvent.setup()
        renderProfile()
        await nameField()

        await user.type(bioField(), ' nhé')
        await user.keyboard('{Control>}{Enter}{/Control}')

        await waitFor(() =>
            expect(api.patch).toHaveBeenCalledWith(
                '/users/me',
                { displayName: 'An', bio: `${saved.bio} nhé` },
                expect.anything()
            )
        )
    })

    it('cuts a pasted bio at 200 characters and says so; typing past the limit just stops', async () => {
        const user = userEvent.setup()
        renderProfile({ bio: '' })
        await nameField()

        await user.click(bioField())
        await user.paste('🙂'.repeat(201))

        expect(bioField()).toHaveValue('🙂'.repeat(200))
        expect(screen.getByText('200/200')).toBeInTheDocument()
        expect(screen.getByText('A bio has at most 200 characters')).toBeInTheDocument()

        await user.type(bioField(), 'a')
        expect(bioField()).toHaveValue('🙂'.repeat(200))
        expect(screen.queryByText('A bio has at most 200 characters')).not.toBeInTheDocument()
    })

    it('asks before leaving with changes: Stay keeps them, Discard changes leaves', async () => {
        const user = userEvent.setup()
        const router = renderProfile()

        await user.type(await nameField(), ' Lê')
        await user.click(screen.getByRole('button', { name: 'Account page' }))

        const ask = await screen.findByRole('dialog', { name: 'Discard changes?' })
        expect(within(ask).getByText('Your new profile is not saved yet.')).toBeInTheDocument()
        await user.click(within(ask).getByRole('button', { name: 'Stay' }))
        expect(router.state.location.pathname).toBe('/settings/profile')
        expect(await nameField()).toHaveValue('An Lê')

        await user.click(screen.getByRole('button', { name: 'Account page' }))
        await user.click(
            within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
                name: 'Discard changes'
            })
        )
        expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument()
        expect(api.patch).not.toHaveBeenCalled()
    })
})

describe('the profile picture', () => {
    const file = (type: string, size = 1024) => {
        const chosen = new File(['x'], 'photo', { type })
        Object.defineProperty(chosen, 'size', { value: size })
        return chosen
    }
    const fileInput = () => document.querySelector<HTMLInputElement>('input[type=file]')!

    it.each([
        ['a GIF', file('image/gif'), 'Only JPG, PNG or WEBP images.'],
        [
            'an image over 8 MB',
            file('image/png', 8 * 1024 * 1024 + 1),
            'This image is larger than 8 MB. Choose another one.'
        ]
    ])('refuses %s under the buttons, without opening the cropper', async (_case, chosen, message) => {
        const user = userEvent.setup({ applyAccept: false })
        renderProfile()
        await nameField()

        await user.upload(fileInput(), chosen)

        expect(screen.getByRole('alert')).toHaveTextContent(message)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('crops and uploads a chosen image; the dialog waits for the upload, then closes', async () => {
        const user = userEvent.setup()
        let finish: (value: unknown) => void = () => undefined
        api.post.mockReturnValue(new Promise((resolve) => (finish = resolve)))
        renderProfile()
        await nameField()

        await user.upload(fileInput(), file('image/jpeg'))
        const dialog = await screen.findByRole('dialog', { name: 'Crop your profile picture' })
        await user.click(within(dialog).getByRole('button', { name: 'Save photo' }))

        await waitFor(() =>
            expect(api.post).toHaveBeenCalledWith('/users/me/avatar', expect.any(FormData), expect.anything())
        )
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
        await user.keyboard('{Escape}')
        expect(dialog).toBeInTheDocument()

        await act(async () => finish({ data: { data: null } }))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(await screen.findByText('Profile picture changed')).toBeInTheDocument()
    })

    describe('removing it', () => {
        beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))

        const removeIt = async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
            renderProfile({ avatarUrl: 'https://cdn.example.test/avatar.webp' })
            await user.click(await screen.findByRole('button', { name: 'Remove photo' }))
            expect(await screen.findByText('Profile picture removed')).toBeInTheDocument()
            return user
        }

        it('takes it away at once, and asks the API only once Undo has run out', async () => {
            await removeIt()
            expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument()
            expect(api.delete).not.toHaveBeenCalled()

            await act(() => vi.advanceTimersByTimeAsync(AVATAR_UNDO_MS))

            expect(api.delete).toHaveBeenCalledWith('/users/me/avatar', undefined)
        })

        it('Undo keeps it and asks nothing', async () => {
            const user = await removeIt()

            await user.click(screen.getByRole('button', { name: 'Undo' }))
            await act(() => vi.advanceTimersByTimeAsync(AVATAR_UNDO_MS))

            expect(api.delete).not.toHaveBeenCalled()
            expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument()
        })

        it('still removes it when the tab closes before Undo runs out, with a request that outlives the page', async () => {
            await removeIt()

            await act(async () => window.dispatchEvent(new Event('pagehide')))

            expect(api.delete).toHaveBeenCalledWith('/users/me/avatar', {
                adapter: 'fetch',
                fetchOptions: { keepalive: true }
            })
            await act(() => vi.advanceTimersByTimeAsync(AVATAR_UNDO_MS))
            expect(api.delete).toHaveBeenCalledTimes(1)
        })

        it('still removes it when signing out before Undo runs out, with the token signing out forgets', async () => {
            setTokenSource(() => 'access-in-memory')
            await removeIt()

            await act(async () => flushBeforeSignOut())

            expect(api.delete).toHaveBeenCalledWith('/users/me/avatar', {
                adapter: 'fetch',
                fetchOptions: { keepalive: true },
                skipAuth: true,
                headers: { Authorization: 'Bearer access-in-memory' }
            })
            await act(() => vi.advanceTimersByTimeAsync(AVATAR_UNDO_MS))
            expect(api.delete).toHaveBeenCalledTimes(1)
            setTokenSource(() => undefined)
        })
    })
})
