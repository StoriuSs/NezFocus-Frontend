import '@/i18n/servers'
import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DoorOpen, Loader2, Trash2 } from 'lucide-react'
import { FormMessage } from '@/components/form/FormMessage'
import { SwitchRow } from '@/components/settings/SwitchRow'
import { Button } from '@/components/ui/button'
import { useOpenTaskCount } from '@/features/tasks'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useUpdateChannel } from '../../api/useChannelLayout'
import {
    changesOf,
    createChannelSettingsSchema,
    settingsOf,
    type ChannelSettingsValues
} from '../../lib/channel-settings'
import { describeFailure, type LayoutFailure } from '../../lib/layout-messages'
import { can } from '../../lib/permissions'
import { badCycleFields, shownCycleFields } from '@/features/study'
import type { Server, ServerChannel } from '../../types'
import { ChannelNameField } from './ChannelNameField'
import { DeleteChannelDialog } from './DeleteChannelDialog'
import { RadioChoices } from './RadioChoices'
import { StudyOffDialog } from './StudyOffDialog'
import { StudyRoomFields } from './StudyRoomFields'
import { ViewRolesPicker } from './ViewRolesPicker'

/**
 * "Channel settings" (S-SET-05): name, who may post and the Task Board
 * (text channels), and whether it is private, saved together by one PATCH
 * of what changed; and "Delete channel", over it. Turning the board off
 * while tasks are not done says what happens to them, under the switch
 * (`taskboard-off`, D-88): no dialog. Type and category do not change here
 * (the category by dragging, S-SRV-06).
 *
 * A room's ("Room settings", S-SET-06) has its study part in place of who may
 * post and the board (`StudyRoomFields`). Someone who manages study rooms but
 * not channels (D-210) sees why the rest is locked, and changes that part
 * only (`study-only`): the name read-only, the private switch off limits, no
 * delete. With a session on, a line says changes apply from the next start,
 * and turning the room off asks first, the session ending for everyone
 * (`study-off-confirm`, D-88).
 */
export function ChannelSettingsDialog({
    server,
    channel,
    onClose
}: {
    server: Server
    channel: ServerChannel
    onClose: () => void
}) {
    const { t } = useTranslation('servers')
    const update = useUpdateChannel(server.id)
    const schema = useMemo(() => createChannelSettingsSchema(t, server, channel), [t, server, channel])
    // The channel as it is now: saved meanwhile in another tab or by someone
    // else, the fields left alone follow it; what was changed here stays (04 SET-EDGE).
    const current = useMemo(() => settingsOf(channel), [channel])
    const {
        control,
        handleSubmit,
        setError,
        clearErrors,
        setFocus,
        formState: { errors, isSubmitting: saving }
    } = useForm<ChannelSettingsValues>({
        resolver: zodResolver(schema),
        // The error goes as they type and is checked again on the next click only.
        reValidateMode: 'onSubmit',
        values: current,
        resetOptions: { keepDirtyValues: true }
    })
    const [name, sendMode, isPrivate, viewRoleIds, taskBoardEnabled, isStudyRoom, studyStarter, cycle] = useWatch({
        control,
        name: [
            'name',
            'sendMode',
            'isPrivate',
            'viewRoleIds',
            'taskBoardEnabled',
            'isStudyRoom',
            'studyStarter',
            'cycle'
        ]
    })
    const values: ChannelSettingsValues = {
        name,
        sendMode,
        isPrivate,
        viewRoleIds,
        taskBoardEnabled,
        isStudyRoom,
        studyStarter,
        cycle
    }
    const [failure, setFailure] = useState<LayoutFailure['form'] | null>(null)
    const [deleting, setDeleting] = useState(false)
    // Saving these would turn off a room with a session: asked first (D-88).
    const [endingWith, setEndingWith] = useState<ChannelSettingsValues | null>(null)

    const categoryId = channel.categoryId ?? null
    const category = server.categories.find((c) => c.id === categoryId)
    const room = channel.type === 'voice'
    const prefix = room ? '' : '#'
    const manages = can(channel.permissions, 'MANAGE_CHANNELS')
    // Its session not yet ended, and how many are in the room (04 S-SET-06).
    const session = room ? (channel.focusSession ?? null) : null
    const people = channel.voiceStates?.length ?? 0

    // A number typed out of range changes nothing yet, but is an edit all the same.
    const dirty =
        Object.keys(changesOf(server, channel, values)).length > 0 ||
        (room && values.isStudyRoom && badCycleFields(values.cycle).length > 0)
    // How many tasks turning the board off hides (04 S-SET-05 `taskboard-off`).
    const openTasks = useOpenTaskCount(channel.id, !room && channel.taskBoardEnabled)

    const send = handleSubmit(async (sending) => {
        const changes = changesOf(server, channel, sending)
        if (Object.keys(changes).length === 0) return onClose()
        if (session && changes.isStudyRoom === false) return setEndingWith(sending)
        await save(sending)
    })

    async function save(sending: ChannelSettingsValues) {
        const changes = changesOf(server, channel, sending)
        setFailure(null)
        try {
            await update.mutateAsync({ channelId: channel.id, changes })
            onClose()
        } catch (error) {
            const described = describeFailure(t, error, {
                server,
                kind: channel.type,
                categoryId,
                typed: sending.name,
                creating: false
            })
            const cycleField = described.cycleField
            // Under its field while that is shown; above the buttons otherwise.
            const shown = cycleField !== undefined && shownCycleFields(sending.cycle).includes(cycleField)
            if (described.gone) {
                onClose()
                toast.error(t('layoutError.gone'))
            } else if (described.field) setError('name', { message: described.field }, { shouldFocus: true })
            else if (shown) setError(`cycle.${cycleField}`, { message: cycleField }, { shouldFocus: true })
            else setFailure(described.form ?? { tone: 'danger', text: t('layoutError.saveFailed') })
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
            <DialogContent
                className='flex max-h-[min(820px,calc(100dvh-48px))] flex-col sm:max-w-[520px]'
                onOpenAutoFocus={(event) => {
                    event.preventDefault()
                    setFocus('name')
                }}
                // Edited: a click outside keeps it open; Esc and Cancel still close at once (S-SET-05).
                onInteractOutside={(event) => (dirty || saving) && event.preventDefault()}
                onEscapeKeyDown={(event) => saving && event.preventDefault()}
            >
                <form onSubmit={(event) => void send(event)} className='flex min-h-0 flex-col gap-5' noValidate>
                    <DialogHeader>
                        <DialogTitle>{t(room ? 'channel.roomSettingsTitle' : 'channel.settingsTitle')}</DialogTitle>
                        <DialogDescription className='text-label text-text-tertiary'>
                            {prefix}
                            {channel.name}
                            {category ? ` · ${category.name.toLocaleUpperCase('vi')}` : null}
                        </DialogDescription>
                    </DialogHeader>

                    <div className='-mx-6 min-h-0 flex-1 space-y-5 overflow-y-auto px-6'>
                        {session ? (
                            <FormMessage tone='neutral'>
                                {t('channel.studyRoom.sessionLive', { count: people })}
                            </FormMessage>
                        ) : null}
                        {manages ? null : (
                            <FormMessage tone='neutral' icon='lock'>
                                {t('channel.studyRoom.onlyStudyPart')}
                            </FormMessage>
                        )}
                        {server.welcomeChannelId === channel.id ? (
                            <p className='flex items-center gap-1.5 text-body-sm text-text-secondary'>
                                <DoorOpen className='size-4 shrink-0' aria-hidden='true' />
                                {t('channel.welcome')}
                            </p>
                        ) : null}

                        <Controller
                            control={control}
                            name='name'
                            render={({ field }) => (
                                <ChannelNameField
                                    kind={channel.type}
                                    studyRoom={values.isStudyRoom}
                                    value={field.value}
                                    onChange={(next) => {
                                        field.onChange(next)
                                        clearErrors('name')
                                    }}
                                    error={errors.name?.message}
                                    readOnly={saving || !manages}
                                    inputRef={field.ref}
                                />
                            )}
                        />

                        {room ? (
                            <div className='border-t pt-5'>
                                <StudyRoomFields control={control} clearErrors={clearErrors} disabled={saving} />
                            </div>
                        ) : (
                            <>
                                <Controller
                                    control={control}
                                    name='sendMode'
                                    render={({ field }) => (
                                        <RadioChoices
                                            legend={t('channel.sendMode.label')}
                                            name='send-mode'
                                            value={field.value}
                                            onChange={field.onChange}
                                            disabled={saving}
                                            choices={[
                                                { value: 'everyone', label: t('channel.sendMode.everyone') },
                                                {
                                                    value: 'managers',
                                                    label: t('channel.sendMode.managers'),
                                                    description: t('channel.sendMode.managersDescription')
                                                }
                                            ]}
                                        />
                                    )}
                                />
                                <div className='grid gap-2'>
                                    <Controller
                                        control={control}
                                        name='taskBoardEnabled'
                                        render={({ field }) => (
                                            <SwitchRow
                                                className='items-start p-0'
                                                label={t('channel.taskBoard.label')}
                                                description={t('channel.taskBoard.description')}
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                                disabled={saving}
                                            />
                                        )}
                                    />
                                    {channel.taskBoardEnabled && !values.taskBoardEnabled && openTasks ? (
                                        <FormMessage tone='neutral'>
                                            {t('channel.taskBoard.offWarning', { count: openTasks })}
                                        </FormMessage>
                                    ) : null}
                                </div>
                            </>
                        )}

                        <div className={cn('space-y-5', room && 'border-t pt-5')}>
                            <Controller
                                control={control}
                                name='isPrivate'
                                render={({ field }) => (
                                    <SwitchRow
                                        className='items-start p-0'
                                        label={t('channel.private.label')}
                                        description={t('channel.private.description')}
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        disabled={saving || !manages}
                                    />
                                )}
                            />
                            {/* Its roles are not sent to someone who does not manage channels. */}
                            {values.isPrivate && manages ? (
                                <Controller
                                    control={control}
                                    name='viewRoleIds'
                                    render={({ field }) => (
                                        <ViewRolesPicker
                                            server={server}
                                            selected={field.value}
                                            onChange={field.onChange}
                                            editing
                                            disabled={saving}
                                        />
                                    )}
                                />
                            ) : null}
                        </div>

                        {manages ? (
                            <div className='border-t pt-4'>
                                <Button
                                    type='button'
                                    variant='text'
                                    size='sm'
                                    className='text-danger'
                                    disabled={saving}
                                    onClick={() => setDeleting(true)}
                                >
                                    <Trash2 aria-hidden='true' />
                                    {t(room ? 'channel.deleteRoom' : 'channel.delete')}
                                </Button>
                            </div>
                        ) : null}
                    </div>

                    {failure ? (
                        <FormMessage tone={failure.tone} icon={failure.icon}>
                            {failure.text}
                        </FormMessage>
                    ) : null}
                    <DialogFooter>
                        <Button type='button' variant='text' disabled={saving} onClick={onClose}>
                            {t('actions.cancel')}
                        </Button>
                        <Button type='submit' disabled={saving}>
                            {saving ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                            {t('actions.save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
            {/* Over this one, with its own scrim (C-14, two layers at most). */}
            {endingWith ? (
                <StudyOffDialog
                    people={people}
                    saving={update.isPending}
                    onCancel={() => setEndingWith(null)}
                    onConfirm={() => void save(endingWith).finally(() => setEndingWith(null))}
                />
            ) : null}
            {deleting ? (
                <DeleteChannelDialog
                    server={server}
                    channel={channel}
                    onCancel={() => setDeleting(false)}
                    onDeleted={onClose}
                />
            ) : null}
        </Dialog>
    )
}
