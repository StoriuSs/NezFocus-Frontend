import { useId } from 'react'
import {
    useController,
    useWatch,
    type Control,
    type FieldValues,
    type Path,
    type UseFormClearErrors
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { NumberField } from '@/components/form/NumberField'
import { Label } from '@/components/ui/label'
import { SegmentedControl, type Segment } from '@/components/ui/segmented-control'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { cycleSummary } from '../lib/cycle-words'
import {
    chosenCycle,
    STUDY_CYCLE_LIMITS,
    stepCycleNumber,
    type CycleChoice,
    type CycleField,
    type CycleForm
} from '../lib/study-cycle'

/** A form holding a cycle under `cycle` (the start and cycle dialogs, a room's settings). */
type WithCycle = FieldValues & { cycle: CycleForm }

/**
 * A cycle in a React Hook Form form (07 S-ROOM-03, S-ROOM-04
 * `paused-edit-config`, 04 S-SET-06), its values under `cycle`: 25/5, 50/10
 * or Custom (SegmentedControl, C-26a); a preset may carry a note (`hint`:
 * the room's own cycle, or what a preset fills in); Custom shows the number
 * fields (C-22) of focus and the short break, the long break's two behind
 * its Switch (C-24a), and sums them up while all are in range. The fields
 * out of range say so once the form is sent (C-01, the form's zod schema:
 * `addCycleIssues`), the focus on the first; a field changed says so no
 * more, and a new choice or the long break's switch takes the errors away
 * they make moot: checked again on the next send only.
 */
export function CycleFields<T extends WithCycle>({
    control,
    clearErrors,
    label,
    labelHidden = false,
    hint,
    disabled = false
}: {
    control: Control<T>
    clearErrors: UseFormClearErrors<T>
    label: string
    labelHidden?: boolean
    /** Under a preset chosen. */
    hint?: string | null
    disabled?: boolean
}) {
    const { t } = useTranslation('study')
    const labelId = useId()
    const longBreakSwitch = useId()
    const at = (name: string) => `cycle.${name}` as Path<T>
    const cycle = useWatch({ control, name: 'cycle' as Path<T> }) as CycleForm
    const choice = useController({ control, name: at('choice') })
    const longBreakOn = useController({ control, name: at('longBreakOn') })
    const fields = {
        focus: useController({ control, name: at('focus') }),
        shortBreak: useController({ control, name: at('shortBreak') }),
        longBreak: useController({ control, name: at('longBreak') }),
        longBreakEvery: useController({ control, name: at('longBreakEvery') })
    }
    const chosen = cycle.choice === 'custom' ? chosenCycle(cycle) : null
    const segments: Segment<CycleChoice>[] = [
        { value: '25/5', label: '25/5', numeric: true },
        { value: '50/10', label: '50/10', numeric: true },
        { value: 'custom', label: t('cycle.custom') }
    ]

    const numberField = (field: CycleField, unit: boolean) => {
        const { min, max } = STUDY_CYCLE_LIMITS[field]
        const { field: input, fieldState } = fields[field]
        return (
            <NumberField
                label={t(`cycle.field.${field}`, { min, max })}
                value={input.value as string}
                onChange={(value) => {
                    input.onChange(value)
                    clearErrors(at(field))
                }}
                onStep={(step) => {
                    input.onChange(stepCycleNumber(field, input.value as string, step))
                    clearErrors(at(field))
                }}
                unit={unit ? t('cycle.minutes') : undefined}
                error={fieldState.error ? t(`cycle.error.${field}`, { min, max }) : undefined}
                readOnly={disabled}
                inputRef={input.ref}
            />
        )
    }

    return (
        <div className='grid gap-1.5'>
            <span id={labelId} className={cn(labelHidden ? 'sr-only' : 'text-label text-text-secondary')}>
                {label}
            </span>
            <div>
                <SegmentedControl
                    aria-labelledby={labelId}
                    value={choice.field.value as CycleChoice}
                    onValueChange={(next) => {
                        choice.field.onChange(next)
                        clearErrors('cycle' as Path<T>)
                    }}
                    segments={segments}
                    disabled={disabled}
                />
            </div>
            {cycle.choice === 'custom' ? (
                <div className='mt-1.5 grid gap-3'>
                    <div className='grid grid-cols-2 items-start gap-4'>
                        {numberField('focus', true)}
                        {numberField('shortBreak', true)}
                    </div>
                    <div className='flex h-8 items-center gap-3'>
                        <Label htmlFor={longBreakSwitch} className='cursor-pointer text-body-sm text-text-primary'>
                            {t('cycle.longBreak')}
                        </Label>
                        <Switch
                            id={longBreakSwitch}
                            checked={longBreakOn.field.value as boolean}
                            onCheckedChange={(on) => {
                                longBreakOn.field.onChange(on)
                                clearErrors([at('longBreak'), at('longBreakEvery')])
                            }}
                            disabled={disabled}
                        />
                    </div>
                    {cycle.longBreakOn ? (
                        <div className='grid grid-cols-2 items-start gap-4'>
                            {numberField('longBreak', true)}
                            {numberField('longBreakEvery', false)}
                        </div>
                    ) : null}
                    {chosen ? <p className='text-label text-text-secondary'>{cycleSummary(t, chosen)}</p> : null}
                </div>
            ) : hint ? (
                <p className='text-label text-text-tertiary'>{hint}</p>
            ) : null}
        </div>
    )
}
