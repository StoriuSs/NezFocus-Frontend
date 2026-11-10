import '@/i18n/servers'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Hash, Loader2, Volume2 } from 'lucide-react'
import { FormMessage } from '@/components/form/FormMessage'
import { SwitchRow } from '@/components/settings/SwitchRow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { OptionCards } from '@/components/ui/option-cards'
import { Select } from '@/components/ui/select'
import { WithTooltip } from '@/components/ui/tooltip'
import { useCreateChannel } from '../../api/useChannelLayout'
import { MAX_CHANNELS_AND_CATEGORIES, storedName, type ChannelType } from '../../lib/channel-layout'
import { describeFailure, nameError, type LayoutFailure } from '../../lib/layout-messages'
import { channelPath } from '../../lib/paths'
import { can } from '../../lib/permissions'
import type { Server } from '../../types'
import { ChannelNameField } from './ChannelNameField'
import { ViewRolesPicker } from './ViewRolesPicker'

const NO_CATEGORY = 'none'

/** The role a creator who is neither owner nor all-powerful starts ticked: their highest (S-SRV-05). */
function startingRoles(server: Server): string[] {
    if (server.isOwner || can(server.permissions, 'ADMINISTRATOR')) return []
    const top = server.roles.find((role) => server.roleIds.includes(role.id))
    return top ? [top.id] : []
}

/** A category deleted meanwhile: back to none (SRV-EDGE). */
const groupIn = (server: Server, categoryId: string | null) =>
    server.categories.some((c) => c.id === categoryId) ? categoryId : null

/** The name is checked against the server as it is now: a clash in the group before any request (D-84). */
const createSchema = (t: TFunction<'servers'>, server: Server) =>
    z
        .object({
            type: z.custom<ChannelType>(),
            name: z.string(),
            categoryId: z.string().nullable(),
            isStudyRoom: z.boolean(),
            isPrivate: z.boolean(),
            viewRoleIds: z.array(z.string())
        })
        .superRefine((values, ctx) => {
            const message = nameError(t, server, values.type, values.name, groupIn(server, values.categoryId))
            if (message) ctx.addIssue({ code: 'custom', path: ['name'], message })
        })

type Values = z.infer<ReturnType<typeof createSchema>>

/**
 * "Create a channel" (S-SRV-05): a text channel or a room (optionally a
 * study room), its name, its category, and whether it is private. Created, it
 * joins the end of its group and opens; a room opens its waiting page (M4).
 * No Toast (Q9).
 */
export function CreateChannelDialog({
    server,
    categoryId: initialCategory,
    type: initialType,
    onClose
}: {
    server: Server
    categoryId: string | null
    type: ChannelType
    onClose: () => void
}) {
    const { t } = useTranslation('servers')
    const navigate = useNavigate()
    const create = useCreateChannel(server.id)
    const schema = useMemo(() => createSchema(t, server), [t, server])
    const {
        control,
        handleSubmit,
        setError,
        clearErrors,
        setFocus,
        formState: { errors, isSubmitting: creating }
    } = useForm<Values>({
        resolver: zodResolver(schema),
        // The error goes as they change the form and is checked again on the next click only.
        reValidateMode: 'onSubmit',
        defaultValues: {
            type: initialType,
            name: '',
            categoryId: initialCategory,
            isStudyRoom: false,
            isPrivate: false,
            viewRoleIds: startingRoles(server)
        }
    })
    const [type, name, categoryId, isPrivate] = useWatch({
        control,
        name: ['type', 'name', 'categoryId', 'isPrivate']
    })
    const [failure, setFailure] = useState<LayoutFailure['form'] | null>(null)

    const atLimit = server.categories.length + server.channels.length >= MAX_CHANNELS_AND_CATEGORIES
    const group = groupIn(server, categoryId)
    const dirty = name.trim() !== ''

    const send = handleSubmit(async (values) => {
        setFailure(null)
        const chosenGroup = groupIn(server, values.categoryId)
        try {
            const created = await create.mutateAsync({
                type: values.type,
                name: storedName(values.type, values.name),
                categoryId: chosenGroup,
                isStudyRoom: values.type === 'voice' && values.isStudyRoom,
                isPrivate: values.isPrivate,
                viewRoleIds: values.isPrivate
                    ? values.viewRoleIds.filter((id) => server.roles.some((r) => r.id === id && !r.administrator))
                    : []
            })
            onClose()
            void navigate(channelPath(server.id, created.id))
        } catch (error) {
            const described = describeFailure(t, error, {
                server,
                kind: values.type,
                categoryId: chosenGroup,
                typed: values.name,
                creating: true
            })
            if (described.gone) {
                onClose()
                toast.error(t('layoutError.gone'))
            } else if (described.field) setError('name', { message: described.field }, { shouldFocus: true })
            else setFailure(described.form ?? null)
        }
    })

    const submitButton = (
        <Button
            type='submit'
            disabled={creating}
            aria-disabled={atLimit || undefined}
            className={atLimit ? 'cursor-default bg-surface-3 text-text-tertiary hover:bg-surface-3' : undefined}
        >
            {creating ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
            {t('actions.createChannel')}
        </Button>
    )

    return (
        <Dialog open onOpenChange={(open) => !open && !creating && onClose()}>
            <DialogContent
                className='flex max-h-[min(820px,calc(100dvh-48px))] flex-col sm:max-w-[520px]'
                aria-describedby={undefined}
                onOpenAutoFocus={(event) => {
                    event.preventDefault()
                    setFocus('name')
                }}
                onInteractOutside={(event) => (dirty || creating) && event.preventDefault()}
                onEscapeKeyDown={(event) => creating && event.preventDefault()}
            >
                <form
                    onSubmit={(event) => {
                        // At the limit nothing is checked or sent: the line above says why.
                        if (atLimit) return event.preventDefault()
                        void send(event)
                    }}
                    className='flex min-h-0 flex-col gap-5'
                    noValidate
                >
                    <DialogHeader>
                        <DialogTitle>{t('channel.createTitle')}</DialogTitle>
                    </DialogHeader>
                    {atLimit ? <FormMessage tone='neutral'>{t('layoutError.limit')}</FormMessage> : null}

                    {/* The middle scrolls when it is taller than the window; the buttons stay in view (C-14). */}
                    <div className='-mx-6 min-h-0 flex-1 space-y-5 overflow-y-auto px-6'>
                        <Controller
                            control={control}
                            name='type'
                            render={({ field }) => (
                                <OptionCards
                                    label={t('channel.type.label')}
                                    value={field.value}
                                    onChange={(next) => {
                                        field.onChange(next)
                                        clearErrors('name')
                                    }}
                                    disabled={creating}
                                    options={[
                                        {
                                            value: 'text',
                                            icon: Hash,
                                            title: t('channel.type.text'),
                                            description: t('channel.type.textDescription')
                                        },
                                        {
                                            value: 'voice',
                                            icon: Volume2,
                                            title: t('channel.type.voice'),
                                            description: t('channel.type.voiceDescription')
                                        }
                                    ]}
                                />
                            )}
                        />

                        <Controller
                            control={control}
                            name='name'
                            render={({ field }) => (
                                <ChannelNameField
                                    kind={type}
                                    value={field.value}
                                    onChange={(next) => {
                                        field.onChange(next)
                                        clearErrors('name')
                                    }}
                                    error={errors.name?.message}
                                    readOnly={creating}
                                    inputRef={field.ref}
                                />
                            )}
                        />

                        <div className='grid gap-1'>
                            <Label htmlFor='create-channel-category' className='text-label text-text-secondary'>
                                {t('channel.category.label')}
                            </Label>
                            <Controller
                                control={control}
                                name='categoryId'
                                render={({ field }) => (
                                    <Select
                                        id='create-channel-category'
                                        value={group ?? NO_CATEGORY}
                                        onValueChange={(value) => {
                                            field.onChange(value === NO_CATEGORY ? null : value)
                                            clearErrors('name')
                                        }}
                                        disabled={creating}
                                        options={[
                                            {
                                                value: NO_CATEGORY,
                                                label: t('channel.category.none'),
                                                description: t('channel.category.noneDescription')
                                            },
                                            ...[...server.categories]
                                                .sort((a, b) => a.position - b.position)
                                                .map((c) => ({ value: c.id, label: c.name.toLocaleUpperCase('vi') }))
                                        ]}
                                    />
                                )}
                            />
                        </div>

                        {type === 'voice' ? (
                            <Controller
                                control={control}
                                name='isStudyRoom'
                                render={({ field }) => (
                                    <SwitchRow
                                        className='items-start p-0'
                                        label={t('channel.study.label')}
                                        description={t('channel.study.description')}
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        disabled={creating}
                                    />
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
                                    disabled={creating}
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
                                        disabled={creating}
                                    />
                                )}
                            />
                        ) : null}
                    </div>

                    {failure ? (
                        <FormMessage tone={failure.tone} icon={failure.icon}>
                            {failure.text}
                        </FormMessage>
                    ) : null}
                    <DialogFooter>
                        <Button type='button' variant='text' disabled={creating} onClick={onClose}>
                            {t('actions.cancel')}
                        </Button>
                        {atLimit ? (
                            <WithTooltip label={t('layoutError.limit')}>{submitButton}</WithTooltip>
                        ) : (
                            submitButton
                        )}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
