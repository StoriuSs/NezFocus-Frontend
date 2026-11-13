import '@/i18n/servers'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Hash, ImagePlus, LampDesk, Loader2, OctagonX } from 'lucide-react'
import { FormField } from '@/components/form/FormField'
import { FormMessage } from '@/components/form/FormMessage'
import { ImageCropDialog } from '@/components/ImageCropDialog'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { OptionCards } from '@/components/ui/option-cards'
import { WithTooltip } from '@/components/ui/tooltip'
import { getApiErrorType, NETWORK_ERROR } from '@/lib/api-error'
import { IMAGE_TYPES, imageProblem, type ImageProblem } from '@/lib/image-file'
import { cn } from '@/lib/utils'
import { saveNewServerIcon, useCreateServer } from '../api/useCreateServer'
import { useServers } from '../api/useServers'
import { useCreateServerDialog } from '../create-server.store'
import { useInviteDialogs } from '../invite-dialogs.store'
import { firstTextChannel } from '../lib/channel-list'
import { channelPath } from '../lib/paths'
import {
    isServerName,
    MAX_SERVERS,
    normaliseServerName,
    SERVER_NAME_MAX_LENGTH,
    serverInitials,
    serverNameLength
} from '../lib/server-name'
import type { ServerTemplate } from '../types'
import { JoinByCode } from './invites/JoinByCode'

type Problem = 'maxServers' | 'offline' | 'failed'

const createSchema = (t: TFunction<'servers'>) =>
    z.object({
        template: z.custom<ServerTemplate>(),
        name: z.string().refine(isServerName, t('create.name.invalid'))
    })

type Values = z.infer<ReturnType<typeof createSchema>>

/**
 * "Create a server" (S-SRV-01): a template, an optional square picture, and
 * a name. Created, the server joins the end of the rail and its first text
 * channel opens. The picture is uploaded after the server exists, while the
 * button still spins, then the invite panel opens (S-SRV-02 `created`, Q5).
 *
 * "Join with an invite code" is its second mode (D-82): the code, then the
 * invite. Back from it keeps what was typed here.
 */
export default function CreateServerDialog() {
    const { t } = useTranslation('servers')
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { template: initialTemplate, mode, hide } = useCreateServerDialog()
    const showInvite = useInviteDialogs((state) => state.showInvite)
    const [joining, setJoining] = useState(mode === 'join')
    const create = useCreateServer()
    const servers = useServers()
    const atMax = (servers.data?.length ?? 0) >= MAX_SERVERS

    const schema = useMemo(() => createSchema(t), [t])
    const {
        control,
        handleSubmit,
        setError,
        clearErrors,
        setFocus,
        formState: { errors, isSubmitting: creating }
    } = useForm<Values>({
        resolver: zodResolver(schema),
        // The error goes as they type and is checked again on the next click only.
        reValidateMode: 'onSubmit',
        defaultValues: { template: initialTemplate, name: '' }
    })
    const name = useWatch({ control, name: 'name' })
    const [icon, setIcon] = useState<{ blob: Blob; url: string } | null>(null)
    const [chosen, setChosen] = useState<string | null>(null)
    const [iconRefused, setIconRefused] = useState<ImageProblem | null>(null)
    const [problem, setProblem] = useState<Problem | null>(atMax ? 'maxServers' : null)
    const fileInput = useRef<HTMLInputElement>(null)
    const chooseButton = useRef<HTMLButtonElement>(null)

    // An object URL pins its file in memory until released.
    useEffect(() => () => (icon ? URL.revokeObjectURL(icon.url) : undefined), [icon])
    if (atMax && problem === null) setProblem('maxServers')

    function choose(file: File | undefined) {
        if (!file) return
        const refused = imageProblem(file)
        setIconRefused(refused)
        if (!refused) setChosen(URL.createObjectURL(file))
    }

    function closeCrop() {
        if (chosen) URL.revokeObjectURL(chosen)
        setChosen(null)
    }

    function drop(event: DragEvent) {
        event.preventDefault()
        if (!creating) choose(event.dataTransfer.files[0])
    }

    const send = handleSubmit(async (values) => {
        setProblem(null)
        try {
            const server = await create.mutateAsync({
                name: normaliseServerName(values.name),
                template: values.template
            })
            if (icon) {
                await saveNewServerIcon(queryClient, server, icon.blob, {
                    failed: t('create.iconFailed', { name: server.name }),
                    retry: t('create.retry')
                })
            }
            hide()
            void navigate(channelPath(server.id, firstTextChannel(server)?.id))
            showInvite(server.id, true)
        } catch (error) {
            const type = getApiErrorType(error)
            if (type === 'MAX_SERVERS_REACHED') setProblem('maxServers')
            else if (type === 'VALIDATION_ERROR')
                setError('name', { message: t('create.name.invalid') }, { shouldFocus: true })
            else setProblem(type === NETWORK_ERROR ? 'offline' : 'failed')
        }
    })

    const dirty = name.trim() !== '' || icon !== null
    const submitButton = (
        <Button
            type='submit'
            disabled={creating}
            // Still focusable when they are in 100 servers, so its tooltip says why (C-00).
            aria-disabled={atMax || undefined}
            className={atMax ? 'cursor-default bg-surface-3 text-text-tertiary hover:bg-surface-3' : undefined}
        >
            {creating ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
            {t('create.submit')}
        </Button>
    )

    return (
        <Dialog open onOpenChange={(open) => !open && !creating && hide()}>
            <DialogContent
                className='sm:max-w-[520px]'
                // The name, not the first template card (C-14: the first field without a value).
                onOpenAutoFocus={(event) => {
                    event.preventDefault()
                    // Opened on "Join with an invite code": its field takes the focus itself.
                    if (!joining) setFocus('name')
                }}
                // A click on the scrim keeps what was typed or chosen (C-14).
                onInteractOutside={(event) => (dirty || creating || joining) && event.preventDefault()}
                onEscapeKeyDown={(event) => creating && event.preventDefault()}
            >
                {joining ? <JoinByCode onBack={() => setJoining(false)} onClose={hide} /> : null}
                <form
                    hidden={joining}
                    onSubmit={(event) => {
                        // At 100 servers the name has nothing to fix: no check, nothing sent.
                        if (atMax) return event.preventDefault()
                        void send(event)
                    }}
                    className='space-y-5'
                    noValidate
                >
                    <DialogHeader>
                        <DialogTitle>{t('create.title')}</DialogTitle>
                        <DialogDescription>{t('create.description')}</DialogDescription>
                    </DialogHeader>
                    {problem === 'maxServers' ? (
                        <FormMessage tone='neutral'>{t('create.maxServers')}</FormMessage>
                    ) : null}

                    <div className='space-y-2'>
                        <Controller
                            control={control}
                            name='template'
                            render={({ field }) => (
                                <OptionCards
                                    label={t('create.templates')}
                                    value={field.value}
                                    onChange={field.onChange}
                                    disabled={creating}
                                    options={[
                                        {
                                            value: 'study',
                                            icon: LampDesk,
                                            title: t('create.study.title'),
                                            tag: t('create.study.tag'),
                                            description: t('create.study.description')
                                        },
                                        {
                                            value: 'standard',
                                            icon: Hash,
                                            title: t('create.standard.title'),
                                            description: t('create.standard.description')
                                        }
                                    ]}
                                />
                            )}
                        />
                        <p className='text-label text-text-tertiary'>{t('create.note')}</p>
                    </div>

                    <div className='flex items-start gap-4'>
                        {/* For the mouse and a dropped file; the keyboard has "Choose image" beside it. */}
                        <button
                            type='button'
                            aria-label={t('create.icon.pick')}
                            tabIndex={-1}
                            disabled={creating}
                            onClick={() => fileInput.current?.click()}
                            onDragOver={(event) => event.dataTransfer.types.includes('Files') && event.preventDefault()}
                            onDrop={drop}
                            className='size-[72px] shrink-0 overflow-hidden rounded-[33%] bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
                        >
                            {icon ? (
                                <img src={icon.url} alt='' className='size-full object-cover' />
                            ) : serverInitials(name) ? (
                                <span className='text-title-2 font-semibold text-text-primary' aria-hidden='true'>
                                    {serverInitials(name)}
                                </span>
                            ) : (
                                <ImagePlus className='mx-auto size-6 text-text-tertiary' aria-hidden='true' />
                            )}
                        </button>
                        <div className='grid gap-2'>
                            <p className='text-label text-text-secondary'>{t('create.icon.label')}</p>
                            <div className='flex gap-2'>
                                <Button
                                    ref={chooseButton}
                                    type='button'
                                    variant='secondary'
                                    size='sm'
                                    disabled={creating}
                                    onClick={() => fileInput.current?.click()}
                                >
                                    {icon ? t('create.icon.change') : t('create.icon.choose')}
                                </Button>
                                {icon ? (
                                    <Button
                                        type='button'
                                        variant='text'
                                        size='sm'
                                        disabled={creating}
                                        onClick={() => setIcon(null)}
                                    >
                                        {t('create.icon.remove')}
                                    </Button>
                                ) : null}
                            </div>
                            {iconRefused ? (
                                <p className='flex gap-1.5 text-label text-danger' role='alert'>
                                    <OctagonX className='mt-[3px] size-3.5 shrink-0' aria-hidden='true' />
                                    {t(`create.icon.${iconRefused}`)}
                                </p>
                            ) : (
                                <p className='text-label text-text-tertiary'>{t('create.icon.hint')}</p>
                            )}
                        </div>
                        <input
                            ref={fileInput}
                            type='file'
                            accept={IMAGE_TYPES.join(',')}
                            className='hidden'
                            aria-hidden='true'
                            tabIndex={-1}
                            onChange={(event) => {
                                choose(event.target.files?.[0])
                                // The same file chosen again is a change too.
                                event.target.value = ''
                            }}
                        />
                    </div>

                    <FormField
                        label={t('create.name.label')}
                        // Put into words here, so a language changed meanwhile shows at once.
                        error={errors.name ? t('create.name.invalid') : undefined}
                        action={
                            <span
                                className={cn(
                                    'font-numeric tabular-nums',
                                    serverNameLength(name) >= SERVER_NAME_MAX_LENGTH
                                        ? 'text-text-secondary'
                                        : 'text-text-tertiary'
                                )}
                            >
                                {serverNameLength(name)}/{SERVER_NAME_MAX_LENGTH}
                            </span>
                        }
                    >
                        {(wiring) => (
                            <Controller
                                control={control}
                                name='name'
                                render={({ field }) => (
                                    <Input
                                        {...wiring}
                                        ref={field.ref}
                                        value={field.value}
                                        onBlur={field.onBlur}
                                        readOnly={creating}
                                        placeholder={t('create.name.placeholder')}
                                        autoComplete='off'
                                        onChange={(event) => {
                                            // Typing stops at the limit, counted as the API counts.
                                            field.onChange(
                                                [...event.target.value].slice(0, SERVER_NAME_MAX_LENGTH).join('')
                                            )
                                            clearErrors('name')
                                        }}
                                    />
                                )}
                            />
                        )}
                    </FormField>

                    {problem === 'offline' || problem === 'failed' ? (
                        <FormMessage tone='danger' icon={problem === 'offline' ? 'wifi-off' : undefined}>
                            {t(`create.${problem}`)}
                        </FormMessage>
                    ) : null}

                    <DialogFooter>
                        <Button
                            type='button'
                            variant='text'
                            className='sm:mr-auto'
                            disabled={creating}
                            onClick={() => setJoining(true)}
                        >
                            {t('byCode.open')}
                        </Button>
                        <Button type='button' variant='text' disabled={creating} onClick={hide}>
                            {t('create.cancel')}
                        </Button>
                        {atMax ? (
                            <WithTooltip label={t('create.maxServers')}>{submitButton}</WithTooltip>
                        ) : (
                            submitButton
                        )}
                    </DialogFooter>
                </form>
            </DialogContent>
            {chosen ? (
                <ImageCropDialog
                    key={chosen}
                    src={chosen}
                    mask='squircle'
                    title={t('crop.title')}
                    description={t('crop.description')}
                    confirmLabel={t('crop.confirm')}
                    returnFocus={chooseButton}
                    onConfirm={(blob) => {
                        setIcon({ blob, url: URL.createObjectURL(blob) })
                        closeCrop()
                    }}
                    onClose={closeCrop}
                />
            ) : null}
        </Dialog>
    )
}
