/** Divider/date (C-10): the day's name between two lines. */
export function DateDivider({ label }: { label: string }) {
    return (
        <div role='separator' aria-label={label} className='flex items-center gap-2 px-4 py-2'>
            <span className='h-px flex-1 bg-border' aria-hidden='true' />
            <span className='text-label font-semibold text-text-tertiary' aria-hidden='true'>
                {label}
            </span>
            <span className='h-px flex-1 bg-border' aria-hidden='true' />
        </div>
    )
}
