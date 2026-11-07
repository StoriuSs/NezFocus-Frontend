import { lazy, Suspense, useState, type CSSProperties } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import type { MascotMood } from './RiveMascot'

/** Rive and its WebAssembly load only when Runtime moves (below). */
const RiveMascot = lazy(() => import('./RiveMascot'))

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

interface MascotProps {
    mood: MascotMood
    /** Wave once when Runtime appears (DESIGN.md › Mascot: greeting pages). */
    wave?: boolean
    size: number
    /** The same mood as a picture: shown at once, and kept if Rive is not loaded. */
    still: string
    /** Load Rive only while this media query matches: where the mascot is on screen. */
    loadWhen: string
    className?: string
    style?: CSSProperties
}

/**
 * Runtime, the mascot (DESIGN.md › Illustration & Mascot), decorative.
 *
 * The picture of the mood shows first, so the page never waits for Runtime.
 * Rive (about 0.4 MB of script and WebAssembly, gzipped) loads afterwards, in
 * its own chunk, and only when Runtime moves: where it is on screen, and not
 * when the person asked for less movement (DESIGN.md › Accessibility) — then
 * the picture stays, which is the still Runtime of that mood. Once Rive has
 * the mascot, the picture fades out over it. If Rive fails to load, the
 * picture stays.
 */
export function Mascot({ mood, wave = false, size, still, loadWhen, className, style }: MascotProps) {
    const reduced = useMediaQuery(REDUCED_MOTION)
    const onScreen = useMediaQuery(loadWhen)
    const [ready, setReady] = useState(false)
    const moves = onScreen && !reduced

    return (
        <div className={cn('relative', className)} style={{ width: size, height: size, ...style }}>
            {moves ? (
                <Suspense fallback={null}>
                    <RiveMascot mood={mood} wave={wave} onReady={() => setReady(true)} className='absolute inset-0' />
                </Suspense>
            ) : null}
            <img
                src={still}
                alt=''
                role='presentation'
                width={size}
                height={size}
                data-state={moves && ready ? 'hidden' : 'shown'}
                className='absolute inset-0 transition-opacity duration-200 data-[state=hidden]:opacity-0'
            />
        </div>
    )
}
