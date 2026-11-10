import '@/i18n/servers'
import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DoorOpen, Loader2, Trash2 } from 'lucide-react'
import { FormMessage } from '@/components/form/FormMessage'
import { SwitchRow } from '@/components/settings/SwitchRow'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { useUpdateChannel } from '../../api/useChannelLayout'
import { storedName } from '../../lib/channel-layout'
import { describeFailure, nameError, type LayoutFailure } from '../../lib/layout-messages'
import type { Server, ServerChannel, UpdateChannelRequest } from '../../types'
import { ChannelNameField } from './ChannelNameField'
import { DeleteChannelDialog } from './DeleteChannelDialog'
import { ViewRolesPicker } from './ViewRolesPicker'

type SendMode = ServerChannel['sendMode']

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id))

/** A new name is checked against the server as it is now; the name kept is not checked again. */
const createSchema = (t: TFunction<'servers'>, server: Server, channel: ServerChannel) =>
    z
        .object({
            name: z.string(),
            sendMode: z.custom<SendMode>(),
            isPrivate: z.boolean(),
            viewRoleIds: z.array(z.string())
        })
        .superRefine((values, ctx) => {
            if (storedName(channel.type, values.name) === channel.name) return
            const message = nameError(t, server, channel.type, values.name, channel.categoryId ?? null, channel.id)
            if (message) ctx.addIssue({ code: 'custom', path: ['name'], message })
        })

type Values = z.infer<ReturnType<typeof createSchema>>

/** Only what differs from the channel goes out. */
function changesOf(server: Server, channel: ServerChannel, values: Values): UpdateChannelRequest {
    const changes: UpdateChannelRequest = {}
    if (storedName(channel.type, values.name) !== channel.name) changes.name = values.name
    if (values.sendMode !== channel.sendMode) changes.sendMode = values.sendMode
    if (values.isPrivate !== channel.isPrivate) changes.isPrivate = values.isPrivate
    const rolesToSend = values.viewRoleIds.filter((id) => server.roles.some((r) => r.id === id && !r.administrator))
    if (values.isPrivate && !sameSet(rolesToSend, channel.viewRoleIds ?? [])) changes.viewRoleIds = rolesToSend
    return changes
}

/**
 * "Channel settings" (S-SET-05): name, who may post (text channels), and
 * whether it is private, saved together by one PATCH of what changed; and
 * "Delete channel", over it. Type and category do not change here (the
 * category by dragging, S-SRV-06). The Task Board switch comes with tasks
 * (M3) and a room's study settings with rooms (S-SET-06, M4), D-144.
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
    const schema = useMemo(() => createSchema(t, server, channel), [t, server, channel])
    const {
        control,
        handleSubmit,
        setError,
        clearErrors,
        setFocus,
        formState: { errors, isSubmitting: saving }
    } = useForm<Values>({
        resolver: zodResolver(schema),
        // The error goes as they type and is checked again on the next click only.
        reValidateMode: 'onSubmit',
        defaultValues: {
            name: channel.name,
            sendMode: channel.sendMode,
            isPrivate: channel.isPrivate,
            viewRoleIds: channel.viewRoleIds ?? []
        }
    })
    const [name, sendMode, isPrivate, viewRoleIds] = useWatch({
        control,
        name: ['name', 'sendMode', 'isPrivate', 'viewRoleIds']
    })
    const [failure, setFailure] = useState<LayoutFailure['form'] | null>(null)
    const [deleting, setDeleting] = useState(false)

    const categoryId = channel.categoryId ?? null
    const category = server.categories.find((c) => c.id === categoryId)
    const room = channel.type === 'voice'
    const prefix = room ? '' : '#'

    const dirty = Object.keys(changesOf(server, channel, { name, sendMode, isPrivate, viewRoleIds })).length > 0

    const send = handleSubmit(async (values) => {
        const changes = changesOf(server, channel, values)
        if (Object.keys(changes).length === 0) return onClose()
        setFailure(null)
        try {
            await update.mutateAsync({ channelId: channel.id, changes })
            onClose()
        } catch (error) {
            const described = describeFailure(t, error, {
                server,
                kind: channel.type,
                categoryId,
                typed: values.name,
                creating: false
            })
            if (described.gone) {
                onClose()
                toast.error(t('layoutError.gone'))
            } else if (described.field) setError('name', { message: described.field }, { shouldFocus: true })
            else setFailure(described.form ?? null)
        }
    })

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
                                    value={field.value}
                                    onChange={(next) => {
                                        field.onChange(next)
                                        clearErrors('name')
                                    }}
                                    error={errors.name?.message}
                                    readOnly={saving}
                                    inputRef={field.ref}
                                />
                            )}
                        />

                        {!room ? (
                            <Controller
                                control={control}
                                name='sendMode'
                                render={({ field }) => (
                                    <fieldset className='grid gap-2'>
                                        <legend className='mb-2 text-label text-text-secondary'>
                                            {t('channel.sendMode.label')}
                                        </legend>
                                        {(['everyone', 'managers'] as const).map((mode) => (
                                            <label key={mode} className='flex cursor-pointer items-start gap-3'>
                                                <input
                                                    type='radio'
                                                    name='send-mode'
                                                    value={mode}
                                                    checked={field.value === mode}
                                                    disabled={saving}
                                                    onChange={() => field.onChange(mode)}
                                                    className='mt-0.5 size-[18px] shrink-0 cursor-pointer appearance-none rounded-full border-2 border-border-input bg-bg transition-colors duration-micro checked:border-[6px] checked:border-primary'
                                                />
                                                <span className='grid'>
                                                    <span className='text-body-sm text-text-primary'>
                                                        {t(`channel.sendMode.${mode}`)}
                                                    </span>
                                                    {mode === 'managers' ? (
                                                        <span className='text-label text-text-tertiary'>
                                                            {t('channel.sendMode.managersDescription')}
                                                        </span>
                                                    ) : null}
                                                </span>
                                            </label>
                                        ))}
                                    </fieldset>
                                )}
                            />
                        ) : null}

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
                                    disabled={saving}
                                />
                            )}
                        />
                        {isPrivate ? (
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
