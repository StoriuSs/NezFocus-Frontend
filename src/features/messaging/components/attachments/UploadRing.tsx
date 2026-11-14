/**
 * How far an upload is (C-41 `uploading`): a ring of 32, `primary` going
 * round clockwise from twelve o'clock over a `surface-3` track. Drawn only:
 * the tile says the number.
 */
export function UploadRing({ progress }: { progress: number }) {
    const around = 2 * Math.PI * 14
    return (
        // Inline: one-off drawing, kept out of the chat's stylesheet (CONSTRAINTS.md › bundle).
        <svg viewBox='0 0 32 32' className='size-8' style={{ transform: 'rotate(-90deg)' }} aria-hidden='true'>
            <circle cx='16' cy='16' r='14' fill='none' strokeWidth='3' stroke='rgb(var(--surface-3))' />
            <circle
                cx='16'
                cy='16'
                r='14'
                fill='none'
                strokeWidth='3'
                strokeLinecap='round'
                strokeDasharray={around}
                strokeDashoffset={around * (1 - Math.min(1, Math.max(0, progress)))}
                stroke='rgb(var(--primary))'
                style={{ transition: 'stroke-dashoffset 120ms ease' }}
            />
        </svg>
    )
}
