import { useRef, useState, type FormEvent } from 'react'
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
    const nameInput = useRef<HTMLInputElement>(null)

    const startRoles = channel.viewRoleIds ?? []
    const [name, setName] = useState(channel.name)
    const [sendMode, setSendMode] = useState<SendMode>(channel.sendMode)
    const [isPrivate, setIsPrivate] = useState(channel.isPrivate)
    const [viewRoleIds, setViewRoleIds] = useState<string[]>(startRoles)
    const [fieldError, setFieldError] = useState<string | null>(null)
    const [failure, setFailure] = useState<LayoutFailure['form'] | null>(null)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const categoryId = channel.categoryId ?? null
    const category = server.categories.find((c) => c.id === categoryId)
    const room = channel.type === 'voice'
    const prefix = room ? '' : '#'

    // Only what differs from the channel goes out.
    const changes: UpdateChannelRequest = {}
    if (storedName(channel.type, name) !== channel.name) changes.name = name
    if (sendMode !== channel.sendMode) changes.sendMode = sendMode
    if (isPrivate !== channel.isPrivate) changes.isPrivate = isPrivate
    const rolesToSend = viewRoleIds.filter((id) => server.roles.some((r) => r.id === id && !r.administrator))
    if (isPrivate && !sameSet(rolesToSend, startRoles)) changes.viewRoleIds = rolesToSend
    const dirty = Object.keys(changes).length > 0

    async function submit(event: FormEvent) {
        event.preventDefault()
        if (saving) return
        if (!dirty) return onClose()
        if (changes.name !== undefined) {
            const problem = nameError(t, server, channel.type, name, categoryId, channel.id)
            if (problem) {
                setFieldError(problem)
                nameInput.current?.focus()
                return
            }
        }
        setFailure(null)
        setSaving(true)
        try {
            await update.mutateAsync({ channelId: channel.id, changes })
            onClose()
        } catch (error) {
            const described = describeFailure(t, error, {
                server,
                kind: channel.type,
                categoryId,
                typed: name,
                creating: false
            })
            if (described.gone) {
                onClose()
                toast.error(t('layoutError.gone'))
            } else if (described.field) {
                setFieldError(described.field)
                nameInput.current?.focus()
            } else setFailure(described.form ?? null)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
            <DialogContent
                className='flex max-h-[min(820px,calc(100dvh-48px))] flex-col sm:max-w-[520px]'
                onOpenAutoFocus={(event) => {
                    event.preventDefault()
                    nameInput.current?.focus()
                }}
                // Edited: a click outside keeps it open; Esc and Cancel still close at once (S-SET-05).
                onInteractOutside={(event) => (dirty || saving) && event.preventDefault()}
                onEscapeKeyDown={(event) => saving && event.preventDefault()}
            >
                <form onSubmit={(event) => void submit(event)} className='flex min-h-0 flex-col gap-5' noValidate>
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

                        <ChannelNameField
                            kind={channel.type}
                            value={name}
                            onChange={(next) => {
                                setName(next)
                                setFieldError(null)
                            }}
                            error={fieldError}
                            readOnly={saving}
                            inputRef={nameInput}
                        />

                        {!room ? (
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
                                            checked={sendMode === mode}
                                            disabled={saving}
                                            onChange={() => setSendMode(mode)}
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
                        ) : null}

                        <SwitchRow
                            className='items-start p-0'
                            label={t('channel.private.label')}
                            description={t('channel.private.description')}
                            checked={isPrivate}
                            onCheckedChange={setIsPrivate}
                            disabled={saving}
                        />
                        {isPrivate ? (
                            <ViewRolesPicker
                                server={server}
                                selected={viewRoleIds}
                                onChange={setViewRoleIds}
                                editing
                                disabled={saving}
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
