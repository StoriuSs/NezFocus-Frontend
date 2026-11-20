export interface RadioChoice<T extends string> {
    value: T
    label: string
    /** A second line under the label, `label` `text-tertiary`. */
    description?: string
}

/**
 * One choice of a few, as rows (C-24c RadioRow) under a legend: who may post
 * in a text channel (S-SET-05), who may start a study session (S-SET-06).
 * Real radio inputs, so the arrow keys move between them.
 */
export function RadioChoices<T extends string>({
    legend,
    name,
    value,
    choices,
    onChange,
    disabled
}: {
    legend: string
    /** The radio group's name, one per form. */
    name: string
    value: T
    choices: readonly RadioChoice<T>[]
    onChange: (value: T) => void
    disabled?: boolean
}) {
    return (
        <fieldset className='grid gap-2'>
            <legend className='mb-2 text-label text-text-secondary'>{legend}</legend>
            {choices.map((choice) => (
                <label key={choice.value} className='flex cursor-pointer items-start gap-3'>
                    <input
                        type='radio'
                        name={name}
                        value={choice.value}
                        checked={value === choice.value}
                        disabled={disabled}
                        onChange={() => onChange(choice.value)}
                        className='mt-0.5 size-[18px] shrink-0 cursor-pointer appearance-none rounded-full border-2 border-border-input bg-bg transition-colors duration-micro checked:border-[6px] checked:border-primary'
                    />
                    <span className='grid'>
                        <span className='text-body-sm text-text-primary'>{choice.label}</span>
                        {choice.description ? (
                            <span className='text-label text-text-tertiary'>{choice.description}</span>
                        ) : null}
                    </span>
                </label>
            ))}
        </fieldset>
    )
}
