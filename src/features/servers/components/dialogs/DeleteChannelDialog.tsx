import '@/i18n/servers'
import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { FormMessage } from '@/components/form/FormMessage'
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
import { Label } from '@/components/ui/label'
import { useDeleteChannel } from '../../api/useChannelLayout'
import { firstTextChannel } from '../../lib/channel-list'
import { describeFailure } from '../../lib/layout-messages'
import { channelPath } from '../../lib/paths'
import type { Server, ServerChannel } from '../../types'

/** Case and accents left out (C-14 `type-name`): "Viec-Nhom" confirms "việc-nhóm". */
export const sameTyped = (typed: string, name: string) => {
    const fold = (text: string) =>
        text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().trim()
    return fold(typed) === fold(name)
}

/**
 * "Delete #viec-nhom?" (S-SET-05 `delete-confirm`), over the settings
 * dialog: the button stays off until the name is typed. Deleted, the open
 * page moves to the first text channel left and a Toast says so.
 */
export function DeleteChannelDialog({
    server,
    channel,
    onCancel,
    onDeleted
}: {
    server: Server
    channel: ServerChannel
    onCancel: () => void
    onDeleted: () => void
}) {
    const { t } = useTranslation('servers')
    const navigate = useNavigate()
    const { pathname } = useLocation()
    const remove = useDeleteChannel(server.id)
    const [typed, setTyped] = useState('')
    const [deleting, setDeleting] = useState(false)
    const [failure, setFailure] = useState<{ text: string; icon?: 'wifi-off' } | null>(null)

    const room = channel.type === 'voice'
    const matches = sameTyped(typed, channel.name)

    async function submit(event: FormEvent) {
        event.preventDefault()
        if (!matches || deleting) return
        setDeleting(true)
        setFailure(null)
        try {
            const updated = await remove.mutateAsync(channel.id)
            onDeleted()
            if (pathname === channelPath(server.id, channel.id)) {
                void navigate(channelPath(server.id, firstTextChannel(updated)?.id), { replace: true })
            }
            toast.success(t(room ? 'channel.roomDeleted' : 'channel.deleted', { name: channel.name }))
        } catch (error) {
            const described = describeFailure(t, error, {
                server,
                kind: channel.type,
                categoryId: channel.categoryId ?? null,
                typed: channel.name,
                creating: false
            })
            if (described.gone) {
                onDeleted()
                toast.error(t('layoutError.gone'))
            } else setFailure(described.form ?? { text: t('layoutError.saveFailed') })
        } finally {
            setDeleting(false)
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !deleting && onCancel()}>
            {/* Never closed by a click outside (C-14 `type-name`). */}
            <DialogContent className='sm:max-w-dialog' onInteractOutside={(event) => event.preventDefault()}>
                <form onSubmit={(event) => void submit(event)} className='space-y-4' noValidate>
                    <DialogHeader>
                        <DialogTitle>
                            {t(room ? 'channel.deleteRoomTitle' : 'channel.deleteTitle', { name: channel.name })}
                        </DialogTitle>
                        <DialogDescription>
                            {t(room ? 'channel.deleteRoomBody' : 'channel.deleteBody')}
                            {server.welcomeChannelId === channel.id ? ` ${t('channel.deleteWelcome')}` : null}
                        </DialogDescription>
                    </DialogHeader>
                    <div className='grid gap-1'>
                        <Label htmlFor='delete-channel-name' className='text-label text-text-secondary'>
                            {t('channel.typeToConfirm', { name: channel.name })}
                        </Label>
                        <Input
                            id='delete-channel-name'
                            value={typed}
                            onChange={(event) => setTyped(event.target.value)}
                            autoComplete='off'
                            readOnly={deleting}
                        />
                    </div>
                    {failure ? (
                        <FormMessage tone='danger' icon={failure.icon}>
                            {failure.text}
                        </FormMessage>
                    ) : null}
                    <DialogFooter>
                        <Button type='button' variant='text' disabled={deleting} onClick={onCancel}>
                            {t('actions.cancel')}
                        </Button>
                        <Button type='submit' variant='destructive' disabled={!matches || deleting}>
                            {deleting ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                            {t(room ? 'channel.deleteRoom' : 'channel.delete')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
