import { Flame, LampDesk, ListChecks, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import mascotHappy from '@/assets/mascot/runtime-happy-320.webp'
import { cn } from '@/lib/utils'

const POINTS: { icon: LucideIcon; key: 'timer' | 'counted' | 'tasks' }[] = [
    { icon: LampDesk, key: 'timer' },
    { icon: Flame, key: 'counted' },
    { icon: ListChecks, key: 'tasks' }
]

/** Six people around the ring, from 12 o'clock clockwise (the sample data's names). */
const SEATS = [
    { initial: 'C', angle: 30 },
    { initial: 'D', angle: 90 },
    { initial: 'G', angle: 150 },
    { initial: 'H', angle: 210 },
    { initial: 'M', angle: 270 },
    { initial: 'B', angle: 330 }
]

/** The ring is 360 across; seats 48 sit on a circle of radius 180, so the drawing is 408 square. */
const BOX = 408
const CENTRE = BOX / 2
const SEAT_RADIUS = 180
/** Track 7 % of the diameter (DESIGN.md › rhythm-ring), drawn on its centre line. */
const TRACK = 360 * 0.07
const TRACK_RADIUS = 180 - TRACK / 2

/**
 * The brand half of AuthShell (C-34), from 1024 up: a title, the three things
 * NezFocus does differently (SRS § 1.4), and a rhythm ring with six people
 * and Runtime in the middle. The same on every page outside the app; it never
 * changes with the form.
 *
 * The ring is one image for screen readers; the text is real text. It hides
 * on short windows rather than overlap the text or be cut by an edge
 * (cutting a seat cuts a person, the opposite of the message).
 * Runtime's wave on load waits for the Rive runtime (DESIGN.md › Mascot).
 */
export function BrandPanel({ className }: { className?: string }) {
    const { t } = useTranslation()

    return (
        // Half the width, padding and border included (C-34: two halves). With
        // `flex-1` alone the basis is 0, so the free space is shared only after
        // this panel's padding and border: it came out 129px wider than the form.
        <aside
            className={cn(
                'relative min-w-0 flex-1 basis-1/2 overflow-hidden border-l bg-surface-1 px-16 pt-24',
                className
            )}
        >
            <div className='max-w-[400px]'>
                <h2 className='text-display text-text-primary'>{t('authShell.brand.title')}</h2>
                <p className='mt-2 text-body text-text-secondary'>{t('authShell.brand.description')}</p>
                <ul className='mt-8 space-y-4'>
                    {POINTS.map(({ icon: Icon, key }) => (
                        <li key={key} className='flex gap-3'>
                            <Icon className='mt-0.5 size-5 shrink-0 text-primary' aria-hidden='true' />
                            <div>
                                <p className='text-headline text-text-primary'>{t(`authShell.brand.${key}.title`)}</p>
                                <p className='text-body-sm text-text-secondary'>{t(`authShell.brand.${key}.detail`)}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

            <div
                role='img'
                aria-label={t('authShell.brand.illustration')}
                className='absolute bottom-12 right-12 [@media(max-height:879px)]:hidden'
                style={{ width: BOX, height: BOX }}
            >
                <svg viewBox={`0 0 ${BOX} ${BOX}`} width={BOX} height={BOX} className='absolute inset-0'>
                    <circle
                        cx={CENTRE}
                        cy={CENTRE}
                        r={TRACK_RADIUS}
                        fill='none'
                        strokeWidth={TRACK}
                        className='stroke-border'
                    />
                    {/* Three quarters of a Focus phase, from 12 o'clock clockwise. */}
                    <circle
                        cx={CENTRE}
                        cy={CENTRE}
                        r={TRACK_RADIUS}
                        fill='none'
                        strokeWidth={TRACK}
                        strokeLinecap='round'
                        pathLength={100}
                        strokeDasharray='75 100'
                        transform={`rotate(-90 ${CENTRE} ${CENTRE})`}
                        className='stroke-primary'
                    />
                </svg>
                <img
                    src={mascotHappy}
                    alt=''
                    width={160}
                    height={160}
                    className='absolute'
                    style={{ left: CENTRE - 80, top: CENTRE - 80 }}
                />
                {SEATS.map(({ initial, angle }) => {
                    const radians = (angle * Math.PI) / 180
                    const x = CENTRE + SEAT_RADIUS * Math.sin(radians)
                    const y = CENTRE - SEAT_RADIUS * Math.cos(radians)
                    return (
                        <span
                            key={initial}
                            className='absolute flex size-12 items-center justify-center rounded-full bg-surface-3 text-body font-semibold text-text-primary ring-2 ring-surface-1'
                            style={{ left: x - 24, top: y - 24 }}
                        >
                            {initial}
                        </span>
                    )
                })}
            </div>
        </aside>
    )
}
