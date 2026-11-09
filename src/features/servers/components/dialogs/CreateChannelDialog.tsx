import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Hash, Loader2, Volume2 } from 'lucide-react'
import { FormMessage } from '@/components/form/FormMessage'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { OptionCards } from '@/components/ui/option-cards'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { WithTooltip } from '@/components/ui/tooltip'
import { generateIdempotencyKey } from '@/lib/idempotency'
import { createChannel } from '../../api/layout.api'
import { rememberServer } from '../../api/useServers'
import { MAX_CHANNELS_AND_CATEGORIES, storedName, type ChannelType } from '../../lib/channel-layout'
import { can } from '../../lib/permissions'
import type { Server } from '../../types'
import { describeFailure, nameError, type LayoutFailure } from './layout-errors'
import { ChannelNameField } from './ChannelNameField'
import { ViewRolesPicker } from './ViewRolesPicker'

const NO_CATEGORY = 'none'

/** The role a creator who is neither owner nor all-powerful starts ticked: their highest (S-SRV-05). */
function startingRoles(server: Server): string[] {
    if (server.isOwner || can(server.permissions, 'ADMINISTRATOR')) return []
    const top = server.roles.find((role) => server.roleIds.includes(role.id))
    return top ? [top.id] : []
}

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
    const queryClient = useQueryClient()
    const nameInput = useRef<HTMLInputElement>(null)

    const [type, setType] = useState<ChannelType>(initialType)
    const [name, setName] = useState('')
    const [categoryId, setCategoryId] = useState<string | null>(initialCategory)
    const [isStudyRoom, setIsStudyRoom] = useState(false)
    const [isPrivate, setIsPrivate] = useState(false)
    const [viewRoleIds, setViewRoleIds] = useState(() => startingRoles(server))
    const [fieldError, setFieldError] = useState<string | null>(null)
    const [failure, setFailure] = useState<LayoutFailure['form'] | null>(null)
    const [creating, setCreating] = useState(false)

    const atLimit = server.categories.length + server.channels.length >= MAX_CHANNELS_AND_CATEGORIES
    // A category deleted meanwhile: back to none (SRV-EDGE).
    const category = server.categories.find((c) => c.id === categoryId)
    const group = category ? category.id : null
    const dirty = name.trim() !== ''

    async function submit(event: FormEvent) {
        event.preventDefault()
        if (creating || atLimit) return
        const problem = nameError(t, server, type, name, group)
        if (problem) {
            setFieldError(problem)
            nameInput.current?.focus()
            return
        }
        setFailure(null)
        setCreating(true)
        try {
            const created = await createChannel(
                server.id,
                {
                    type,
                    name: storedName(type, name),
                    categoryId: group,
                    isStudyRoom: type === 'voice' && isStudyRoom,
                    isPrivate,
                    viewRoleIds: isPrivate
                        ? viewRoleIds.filter((id) => server.roles.some((r) => r.id === id && !r.administrator))
                        : []
                },
                generateIdempotencyKey()
            )
            rememberServer(queryClient, created.server)
            onClose()
            void navigate(`/channels/${server.id}/${created.id}`)
        } catch (error) {
            const described = describeFailure(t, error, {
                server,
                kind: type,
                categoryId: group,
                typed: name,
                creating: true
            })
            if (described.gone) {
                onClose()
                toast.error(t('layoutError.gone'))
            } else if (described.field) {
                setFieldError(described.field)
                nameInput.current?.focus()
            } else setFailure(described.form ?? null)
        } finally {
            setCreating(false)
        }
    }

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
                    nameInput.current?.focus()
                }}
                onInteractOutside={(event) => (dirty || creating) && event.preventDefault()}
                onEscapeKeyDown={(event) => creating && event.preventDefault()}
            >
                <form onSubmit={(event) => void submit(event)} className='flex min-h-0 flex-col gap-5' noValidate>
                    <DialogHeader>
                        <DialogTitle>{t('channel.createTitle')}</DialogTitle>
                    </DialogHeader>
                    {atLimit ? <FormMessage tone='neutral'>{t('layoutError.limit')}</FormMessage> : null}

                    {/* The middle scrolls when it is taller than the window; the buttons stay in view (C-14). */}
                    <div className='-mx-6 min-h-0 flex-1 space-y-5 overflow-y-auto px-6'>
                        <OptionCards
                            label={t('channel.type.label')}
                            value={type}
                            onChange={(next) => {
                                setType(next)
                                setFieldError(null)
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

                        <ChannelNameField
                            kind={type}
                            value={name}
                            onChange={(next) => {
                                setName(next)
                                setFieldError(null)
                            }}
                            error={fieldError}
                            readOnly={creating}
                            inputRef={nameInput}
                        />

                        <div className='grid gap-1'>
                            <Label htmlFor='create-channel-category' className='text-label text-text-secondary'>
                                {t('channel.category.label')}
                            </Label>
                            <Select
                                id='create-channel-category'
                                value={group ?? NO_CATEGORY}
                                onValueChange={(value) => {
                                    setCategoryId(value === NO_CATEGORY ? null : value)
                                    setFieldError(null)
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
                        </div>

                        {type === 'voice' ? (
                            <SwitchRow
                                id='create-channel-study'
                                label={t('channel.study.label')}
                                description={t('channel.study.description')}
                                checked={isStudyRoom}
                                onChange={setIsStudyRoom}
                                disabled={creating}
                            />
                        ) : null}

                        <SwitchRow
                            id='create-channel-private'
                            label={t('channel.private.label')}
                            description={t('channel.private.description')}
                            checked={isPrivate}
                            onChange={setIsPrivate}
                            disabled={creating}
                        />
                        {isPrivate ? (
                            <ViewRolesPicker
                                server={server}
                                selected={viewRoleIds}
                                onChange={setViewRoleIds}
                                disabled={creating}
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

/** A Switch with its words (C-24): clicking the words flips it too. */
export function SwitchRow({
    id,
    label,
    description,
    checked,
    onChange,
    disabled
}: {
    id: string
    label: string
    description: string
    checked: boolean
    onChange: (checked: boolean) => void
    disabled?: boolean
}) {
    return (
        <div className='flex items-start gap-4'>
            <div className='min-w-0 flex-1'>
                <label htmlFor={id} id={`${id}-label`} className='block text-body-sm font-medium text-text-primary'>
                    {label}
                </label>
                <p id={`${id}-description`} className='text-label text-text-tertiary'>
                    {description}
                </p>
            </div>
            <Switch
                id={id}
                checked={checked}
                onCheckedChange={onChange}
                disabled={disabled}
                aria-labelledby={`${id}-label`}
                aria-describedby={`${id}-description`}
            />
        </div>
    )
}
