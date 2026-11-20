import '@/i18n/servers'
import { useId } from 'react'
import { Controller, useWatch, type Control, type FieldErrors, type UseFormClearErrors } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { SwitchRow } from '@/components/settings/SwitchRow'
import { Label } from '@/components/ui/label'
import { SegmentedControl, type Segment } from '@/components/ui/segmented-control'
import { Switch } from '@/components/ui/switch'
import type { ChannelSettingsValues } from '../../lib/channel-settings'
import {
    chosenCycle,
    STUDY_CYCLE_LIMITS,
    stepCycleNumber,
    type CycleChoice,
    type CycleField
} from '../../lib/study-cycle'
import { NumberField } from './NumberField'
import { RadioChoices } from './RadioChoices'

/**
 * The study part of "Room settings" (S-SET-06): the "Study room" switch, and
 * while it is on, who may start a session and the cycle a session starts
 * with: 25/5, 50/10, or Custom, which shows the number fields of 07
 * S-ROOM-03 (focus and short break, a long break behind its switch) and sums
 * them up while they are all in range. Someone who manages study rooms only
 * changes this part (D-210).
 */
export function StudyRoomFields({
    control,
    errors,
    clearErrors,
    disabled
}: {
    control: Control<ChannelSettingsValues>
    errors: FieldErrors<ChannelSettingsValues>
    clearErrors: UseFormClearErrors<ChannelSettingsValues>
    disabled: boolean
}) {
    const { t } = useTranslation('servers')
    const cycleLabel = useId()
    const longBreakSwitch = useId()
    const [isStudyRoom, cycle] = useWatch({ control, name: ['isStudyRoom', 'cycle'] })
    const chosen = cycle.choice === 'custom' ? chosenCycle(cycle) : null

    const segments: Segment<CycleChoice>[] = [
        { value: '25/5', label: '25/5', numeric: true },
        { value: '50/10', label: '50/10', numeric: true },
        { value: 'custom', label: t('channel.studyRoom.custom') }
    ]

    const numberField = (field: CycleField, unit: boolean) => {
        const { min, max } = STUDY_CYCLE_LIMITS[field]
        const message = errors.cycle?.[field]?.message
        return (
            <Controller
                control={control}
                name={`cycle.${field}`}
                render={({ field: input }) => (
                    <NumberField
                        label={t(`channel.studyRoom.field.${field}`, { min, max })}
                        value={input.value}
                        onChange={(next) => {
                            input.onChange(next)
                            clearErrors(`cycle.${field}`)
                        }}
                        onStep={(step) => {
                            input.onChange(stepCycleNumber(field, input.value, step))
                            clearErrors(`cycle.${field}`)
                        }}
                        unit={unit ? t('channel.studyRoom.minutes') : undefined}
                        error={message ? t(`channel.studyRoom.error.${field}`, { min, max }) : undefined}
                        readOnly={disabled}
                        inputRef={input.ref}
                    />
                )}
            />
        )
    }

    return (
        <div className='space-y-5'>
            <Controller
                control={control}
                name='isStudyRoom'
                render={({ field }) => (
                    <SwitchRow
                        className='items-start p-0'
                        label={t('channel.studyRoom.label')}
                        description={t('channel.studyRoom.description')}
                        checked={field.value}
                        onCheckedChange={(on) => {
                            field.onChange(on)
                            clearErrors('cycle')
                        }}
                        disabled={disabled}
                    />
                )}
            />
            {isStudyRoom ? (
                <>
                    <Controller
                        control={control}
                        name='studyStarter'
                        render={({ field }) => (
                            <RadioChoices
                                legend={t('channel.studyRoom.starter.label')}
                                name='study-starter'
                                value={field.value}
                                onChange={field.onChange}
                                disabled={disabled}
                                choices={[
                                    { value: 'anyone', label: t('channel.studyRoom.starter.anyone') },
                                    {
                                        value: 'managers',
                                        label: t('channel.studyRoom.starter.managers'),
                                        description: t('channel.studyRoom.starter.managersDescription')
                                    }
                                ]}
                            />
                        )}
                    />

                    <div className='grid gap-1.5'>
                        <span id={cycleLabel} className='text-label text-text-secondary'>
                            {t('channel.studyRoom.cycle')}
                        </span>
                        <Controller
                            control={control}
                            name='cycle.choice'
                            render={({ field }) => (
                                <div>
                                    <SegmentedControl
                                        aria-labelledby={cycleLabel}
                                        value={field.value}
                                        onValueChange={(choice) => {
                                            field.onChange(choice)
                                            // The rule reads the choice: checked again on the next Save only.
                                            clearErrors('cycle')
                                        }}
                                        segments={segments}
                                        disabled={disabled}
                                    />
                                </div>
                            )}
                        />
                        {cycle.choice === 'custom' ? (
                            <>
                                <div className='grid grid-cols-2 items-start gap-4'>
                                    {numberField('focus', true)}
                                    {numberField('shortBreak', true)}
                                </div>
                                <Controller
                                    control={control}
                                    name='cycle.longBreakOn'
                                    render={({ field }) => (
                                        <div className='flex h-8 items-center gap-3'>
                                            <Label
                                                htmlFor={longBreakSwitch}
                                                className='cursor-pointer text-body-sm text-text-primary'
                                            >
                                                {t('channel.studyRoom.longBreak')}
                                            </Label>
                                            <Switch
                                                id={longBreakSwitch}
                                                checked={field.value}
                                                onCheckedChange={(on) => {
                                                    field.onChange(on)
                                                    clearErrors(['cycle.longBreak', 'cycle.longBreakEvery'])
                                                }}
                                                disabled={disabled}
                                            />
                                        </div>
                                    )}
                                />
                                {cycle.longBreakOn ? (
                                    <div className='grid grid-cols-2 items-start gap-4'>
                                        {numberField('longBreak', true)}
                                        {numberField('longBreakEvery', false)}
                                    </div>
                                ) : null}
                                {chosen ? (
                                    <p className='text-label text-text-secondary'>
                                        {chosen.longBreak === null
                                            ? t('channel.studyRoom.summary', {
                                                  focus: chosen.focus,
                                                  shortBreak: chosen.shortBreak
                                              })
                                            : t('channel.studyRoom.summaryLongBreak', {
                                                  focus: chosen.focus,
                                                  shortBreak: chosen.shortBreak,
                                                  longBreak: chosen.longBreak,
                                                  every: chosen.longBreakEvery
                                              })}
                                    </p>
                                ) : null}
                            </>
                        ) : (
                            <p className='text-label text-text-tertiary'>{t('channel.studyRoom.presetHint')}</p>
                        )}
                    </div>
                </>
            ) : null}
        </div>
    )
}
