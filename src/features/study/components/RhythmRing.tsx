import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { SessionPhase } from '../types'

/** The ring's frame: the ring 360 and a 48 seat's half on each side (C-18 `ring`). */
const FRAME = 408
const CENTER = FRAME / 2
const RING = 360
/** 7% of the radius, as the master in the .pen draws it (`innerRadius` 0.93): 12.6 on the 360 ring. */
const STROKE = (RING / 2) * 0.07
const RADIUS = (RING - STROKE) / 2
/** The seats sit on the ring's outer edge. */
const SEAT_RADIUS = RING / 2
/** A short break's dashes on the big ring: 30, each 8° with a 4° gap (C-18, as the mini ring's 15 of 16° and 8°). */
const DASHES = 30
const DASH_DEGREES = 8
/** A long break's two thin rings (C-18 `long-break`, the .pen master): 4.5 on the edge, 5.1 inside a 342 one. */
const DOUBLE = [
    { radius: RING / 2 - 2.25, width: 4.5 },
    { radius: 171 - 2.565, width: 5.13 }
]

const STROKE_COLOR: Record<SessionPhase, string> = {
    focus: 'stroke-phase-focus',
    short_break: 'stroke-phase-short',
    long_break: 'stroke-phase-long'
}

/** A point on a circle, 0° at 12 o'clock, clockwise. */
function point(degrees: number, radius: number): string {
    const angle = (degrees * Math.PI) / 180
    return `${(CENTER + radius * Math.sin(angle)).toFixed(2)} ${(CENTER - radius * Math.cos(angle)).toFixed(2)}`
}

/** The arc from `from` to `to` degrees, clockwise. */
function arc(from: number, to: number, radius: number): string {
    const large = to - from > 180 ? 1 : 0
    return `M ${point(from, radius)} A ${radius} ${radius} 0 ${large} 1 ${point(to, radius)}`
}

/** An arc, or the whole circle when it goes all the way round. */
function Arc({
    from,
    to,
    radius,
    width,
    className
}: {
    from: number
    to: number
    radius: number
    width: number
    className: string
}) {
    if (to - from <= 0) return null
    if (to - from >= 359.99)
        return <circle cx={CENTER} cy={CENTER} r={radius} fill='none' strokeWidth={width} className={className} />
    return <path d={arc(from, to, radius)} fill='none' strokeWidth={width} strokeLinecap='butt' className={className} />
}

/**
 * The study session's shared clock (RhythmRing, C-18 `ring`): a 360 ring
 * with the people's seats on its edge, the one first at 12 o'clock and the
 * others clockwise, evenly; inside it whatever the room shows (the phase and
 * its number, the start, the summary).
 *
 * The track is `border`; the arc is the phase's colour and anchored at 12
 * o'clock: focus is the time left, a solid arc running down clockwise; a
 * break fills up from 12 o'clock as it goes, a short one in dashes, a long
 * one as two thin rings, so the three phases read apart without colour.
 * No phase (no session, or the summary): the track alone.
 */
export function RhythmRing({
    phase,
    gone = 0,
    seats,
    seatsLabel,
    children,
    className
}: {
    /** The phase drawn; none: the track alone. */
    phase?: SessionPhase
    /** How much of the phase is gone, 0 to 1. */
    gone?: number
    /** Each person's seat, in order: the first at 12 o'clock. */
    seats: { id: string; seat: ReactNode }[]
    /** The seats as one group for screen readers (C-18 › Accessibility: "9 người…"). */
    seatsLabel: string
    children: ReactNode
    className?: string
}) {
    const sweep = Math.min(1, Math.max(0, gone)) * 360
    const color = phase ? STROKE_COLOR[phase] : ''
    return (
        <div className={cn('relative shrink-0', className)} style={{ width: FRAME, height: FRAME }}>
            <svg
                aria-hidden='true'
                width={FRAME}
                height={FRAME}
                viewBox={`0 0 ${FRAME} ${FRAME}`}
                className='absolute inset-0'
            >
                {phase === 'long_break' ? (
                    DOUBLE.map((ring) => (
                        <g key={ring.radius}>
                            <Arc from={0} to={360} radius={ring.radius} width={ring.width} className='stroke-border' />
                            <Arc from={0} to={sweep} radius={ring.radius} width={ring.width} className={color} />
                        </g>
                    ))
                ) : (
                    <>
                        <Arc from={0} to={360} radius={RADIUS} width={STROKE} className='stroke-border' />
                        {phase === 'focus' ? (
                            <Arc from={sweep} to={360} radius={RADIUS} width={STROKE} className={color} />
                        ) : null}
                        {phase === 'short_break'
                            ? Array.from({ length: Math.floor((sweep / 360) * DASHES) }, (_, index) => (
                                  <Arc
                                      key={index}
                                      from={(index * 360) / DASHES}
                                      to={(index * 360) / DASHES + DASH_DEGREES}
                                      radius={RADIUS}
                                      width={STROKE}
                                      className={color}
                                  />
                              ))
                            : null}
                    </>
                )}
            </svg>
            <div
                className='absolute flex flex-col items-center justify-center text-center'
                style={{ inset: CENTER - RADIUS + STROKE }}
            >
                {children}
            </div>
            <div role='group' aria-label={seatsLabel}>
                {seats.map(({ id, seat }, index) => {
                    const angle = (index * 2 * Math.PI) / seats.length
                    return (
                        <div
                            key={id}
                            className='absolute size-14 -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-medium ease-in-out motion-reduce:transition-none'
                            style={{
                                left: CENTER + SEAT_RADIUS * Math.sin(angle),
                                top: CENTER - SEAT_RADIUS * Math.cos(angle)
                            }}
                        >
                            {seat}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
