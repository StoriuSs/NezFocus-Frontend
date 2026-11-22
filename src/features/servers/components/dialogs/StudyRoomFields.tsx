import '@/i18n/servers'
import { Suspense } from 'react'
import { Controller, useWatch, type Control, type UseFormClearErrors } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { SwitchRow } from '@/components/settings/SwitchRow'
import { CycleFields } from '@/features/study'
import type { ChannelSettingsValues } from '../../lib/channel-settings'
import { RadioChoices } from './RadioChoices'

/**
 * The study part of "Room settings" (S-SET-06): the "Study room" switch, and
 * while it is on, who may start a session and the cycle a session starts
 * with: 25/5, 50/10, or Custom, which shows the number fields of 07
 * S-ROOM-03 (focus and short break, a long break behind its switch) and sums
 * them up while they are all in range (the study feature's `CycleFields`,
 * the same as the start and cycle dialogs'). Someone who manages study rooms
 * only changes this part (D-210).
 */
export function StudyRoomFields({
    control,
    clearErrors,
    disabled
}: {
    control: Control<ChannelSettingsValues>
    clearErrors: UseFormClearErrors<ChannelSettingsValues>
    disabled: boolean
}) {
    const { t } = useTranslation('servers')
    const isStudyRoom = useWatch({ control, name: 'isStudyRoom' })

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

                    <Suspense fallback={null}>
                        <CycleFields
                            control={control}
                            clearErrors={clearErrors}
                            label={t('channel.studyRoom.cycle')}
                            hint={t('channel.studyRoom.presetHint')}
                            disabled={disabled}
                        />
                    </Suspense>
                </>
            ) : null}
        </div>
    )
}
