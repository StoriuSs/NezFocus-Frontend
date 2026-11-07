import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Mascot, REDUCED_MOTION } from '../Mascot'

/** What the lazily loaded Rive part was asked to do; it reports ready at once. */
const rive = vi.hoisted(() => ({ props: [] as Record<string, unknown>[], ready: true }))

vi.mock('../RiveMascot', () => ({
    default: (props: { onReady: () => void }) => {
        rive.props.push(props)
        if (rive.ready) queueMicrotask(props.onReady)
        return <canvas data-testid='rive-mascot' />
    }
}))

const SHOWN = '(min-width: 1024px) and (min-height: 880px)'

/** Media queries that match: the others do not. */
function matching(...queries: string[]) {
    vi.mocked(window.matchMedia).mockImplementation(
        (query: string) =>
            ({
                matches: queries.includes(query),
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn()
            }) as unknown as MediaQueryList
    )
}

const mascot = () => render(<Mascot mood='happy' wave size={160} still='/happy.webp' loadWhen={SHOWN} />)

describe('Mascot (DESIGN.md › Mascot)', () => {
    beforeEach(() => {
        rive.props = []
        rive.ready = true
    })

    it('shows the still picture first, then hands over to Rive with the mood and one wave', async () => {
        matching(SHOWN)
        mascot()

        const still = screen.getByRole('presentation', { hidden: true })
        expect(still).toHaveAttribute('src', '/happy.webp')
        expect(await screen.findByTestId('rive-mascot')).toBeInTheDocument()
        expect(rive.props[0]).toMatchObject({ mood: 'happy', wave: true })
        // Ready: the picture fades out, the canvas is what shows.
        await vi.waitFor(() => expect(still).toHaveAttribute('data-state', 'hidden'))
    })

    it('keeps the still picture while Rive is not ready, or if it never is', async () => {
        matching(SHOWN)
        rive.ready = false
        mascot()

        expect(await screen.findByTestId('rive-mascot')).toBeInTheDocument()
        expect(screen.getByRole('presentation', { hidden: true })).toHaveAttribute('data-state', 'shown')
    })

    it('never loads Rive when movement is reduced: the still picture stays', async () => {
        matching(SHOWN, REDUCED_MOTION)
        mascot()

        await Promise.resolve()
        expect(screen.queryByTestId('rive-mascot')).not.toBeInTheDocument()
        expect(rive.props).toHaveLength(0)
    })

    it('never loads Rive where it does not show (a small or short window)', async () => {
        matching()
        mascot()

        await Promise.resolve()
        expect(rive.props).toHaveLength(0)
        expect(screen.getByRole('presentation', { hidden: true })).toHaveAttribute('data-state', 'shown')
    })
})
