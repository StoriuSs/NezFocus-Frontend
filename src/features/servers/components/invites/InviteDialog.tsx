import '@/i18n/servers'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { WithTooltip } from '@/components/ui/tooltip'
import { getApiErrorType, NETWORK_ERROR } from '@/lib/api-error'
import { useCreateInvite } from '../../api/useInvites'
import { revokeInvite } from '../../api/invites.api'
import { useServers } from '../../api/useServers'
import { useInviteDialogs } from '../../invite-dialogs.store'
import {
    DEFAULT_INVITE_SETTINGS,
    INVITE_MAX_AGES,
    INVITE_MAX_USES,
    type InviteMaxAge,
    inviteLink,
    sameSettings,
    shownLink,
    timeLeft,
    usesLeft
} from '../../lib/invites'
import type { Invite, InviteSettings } from '../../types'

const ageValue = (age: InviteMaxAge) => (age === null ? 'never' : String(age))
const AGE_LABELS = {
    1800: 'invite.age.1800',
    3600: 'invite.age.3600',
    86400: 'invite.age.86400',
    604800: 'invite.age.604800'
} as const
const usesValue = (uses: number | null) => (uses === null ? 'unlimited' : String(uses))

/**
 * "Invite friends" (S-SRV-02): a link to send, made or handed back again as
 * it opens (D-151), with "Copy" (no toast, Q6), its settings line (Q15),
 * "Change settings" in place, and "Revoke this link" for its creator.
 * Opened from the server menu, and right after creating a server (`created`).
 */
export default function InviteDialog() {
    const { t } = useTranslation('servers')
    const target = useInviteDialogs((state) => state.invite)
    const hide = useInviteDialogs((state) => state.hideInvite)
    const servers = useServers()
    const server = servers.data?.find((candidate) => candidate.id === target?.serverId)
    const create = useCreateInvite(target?.serverId ?? '')
    const [invite, setInvite] = useState<Invite | null>(null)
    const [settings, setSettings] = useState<InviteSettings>(DEFAULT_INVITE_SETTINGS)
    const [editing, setEditing] = useState<InviteSettings | null>(null)
    const [revoked, setRevoked] = useState(false)
    const [revokeFailed, setRevokeFailed] = useState(false)
    const [copied, setCopied] = useState(false)
    const [copyHint, setCopyHint] = useState(false)
    const linkInput = useRef<HTMLInputElement>(null)
    const copyButton = useRef<HTMLButtonElement>(null)

    function make(wanted: InviteSettings) {
        setSettings(wanted)
        setRevoked(false)
        create.mutate(wanted, {
            onSuccess: (made) => {
                setInvite(made)
                setEditing(null)
            }
        })
    }

    // The link of the default settings, as it opens (a second call while the
    // first is in flight is the same request: useIdempotentMutation).
    const { mutate } = create
    const serverId = target?.serverId
    useEffect(() => {
        if (serverId) mutate(DEFAULT_INVITE_SETTINGS, { onSuccess: setInvite })
    }, [serverId, mutate])

    useEffect(() => {
        if (!copied) return
        const timer = setTimeout(() => setCopied(false), 2000)
        return () => clearTimeout(timer)
    }, [copied])

    if (!target || !server) return null
    const link = invite ? inviteLink(invite.code) : ''

    async function copy() {
        try {
            await navigator.clipboard.writeText(link)
            setCopied(true)
            setCopyHint(false)
        } catch {
            // The browser refused: select it for Ctrl C, no error (S-SRV-02 › Sao chép).
            linkInput.current?.select()
            setCopyHint(true)
        }
    }

    async function revoke() {
        if (!invite) return
        setRevokeFailed(false)
        try {
            await revokeInvite(invite.code)
            setRevoked(true)
        } catch (error) {
            // Already gone: the same as revoked, for this panel.
            if (getApiErrorType(error) === 'INVITE_INVALID') setRevoked(true)
            else setRevokeFailed(true)
        }
    }

    const settingsLine = (shown: Invite) => {
        const left = shown.expiresAt ? timeLeft(shown.expiresAt, new Date()) : null
        const expiry = left
            ? t('invite.line.expires', { time: t(`invite.time.${left.unit}`, { count: left.count }) })
            : t('invite.line.never')
        const uses = usesLeft(shown)
        const usesText =
            uses.kind === 'unlimited'
                ? t('invite.line.unlimited')
                : t(`invite.line.${uses.kind}`, { count: uses.count })
        return `${expiry} · ${usesText}`
    }

    const failure = create.isError ? (getApiErrorType(create.error) === NETWORK_ERROR ? 'offline' : 'failed') : null

    return (
        <Dialog open onOpenChange={(open) => !open && hide()}>
            <DialogContent
                className='sm:max-w-[520px]'
                onOpenAutoFocus={(event) => {
                    event.preventDefault()
                    copyButton.current?.focus()
                }}
                // Settings changed: a click outside keeps them (C-14).
                onInteractOutside={(event) => editing && !sameAs(editing, settings) && event.preventDefault()}
                onEscapeKeyDown={(event) => {
                    // Esc in the settings goes back to the link, not out (S-SRV-02 › Bàn phím).
                    if (!editing) return
                    event.preventDefault()
                    setEditing(null)
                }}
            >
                {editing ? (
                    <EditSettings
                        current={invite}
                        value={editing}
                        onChange={setEditing}
                        onBack={() => setEditing(null)}
                        onSubmit={() => make(editing)}
                        creating={create.isPending}
                    />
                ) : (
                    <div className='grid gap-5'>
                        <DialogHeader>
                            <DialogTitle>{t('invite.title', { server: server.name })}</DialogTitle>
                            <DialogDescription>{t('invite.description')}</DialogDescription>
                        </DialogHeader>
                        <div className='grid gap-1'>
                            <Label htmlFor='invite-link' className='text-label text-text-secondary'>
                                {t('invite.link')}
                            </Label>
                            {failure ? (
                                <div className='grid gap-2'>
                                    <FormMessage tone='danger' icon={failure === 'offline' ? 'wifi-off' : undefined}>
                                        {t(`invite.${failure}`)}
                                    </FormMessage>
                                    <div>
                                        <Button type='button' variant='text' size='sm' onClick={() => make(settings)}>
                                            {t('invite.retry')}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className='flex gap-2'>
                                    {invite && !create.isPending ? (
                                        <input
                                            ref={linkInput}
                                            id='invite-link'
                                            readOnly
                                            value={revoked ? t('invite.revoked') : shownLink(link)}
                                            onFocus={(event) => !revoked && event.target.select()}
                                            className={
                                                revoked
                                                    ? 'h-10 min-w-0 flex-1 truncate rounded-input bg-surface-2 px-3 text-body-sm text-text-tertiary outline-none'
                                                    : 'h-10 min-w-0 flex-1 truncate rounded-input bg-surface-2 px-3 font-mono text-body-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary'
                                            }
                                        />
                                    ) : (
                                        <div className='flex h-10 min-w-0 flex-1 items-center rounded-input bg-surface-2 px-3'>
                                            <Skeleton className='h-4 w-48' />
                                        </div>
                                    )}
                                    {revoked ? (
                                        <Button ref={copyButton} type='button' onClick={() => make(settings)}>
                                            {t('invite.newLink')}
                                        </Button>
                                    ) : (
                                        <Button
                                            ref={copyButton}
                                            type='button'
                                            disabled={!invite || create.isPending}
                                            onClick={() => void copy()}
                                        >
                                            {copied ? <Check aria-hidden='true' /> : null}
                                            {copied ? t('invite.copied') : t('invite.copy')}
                                        </Button>
                                    )}
                                </div>
                            )}
                            <span className='sr-only' aria-live='polite'>
                                {copied ? t('invite.copiedAnnounce') : ''}
                            </span>
                            {copyHint ? <p className='text-label text-text-secondary'>{t('invite.copyHint')}</p> : null}
                            {invite && !failure && !revoked ? (
                                <div className='flex flex-wrap items-center justify-between gap-x-2'>
                                    <div className='text-label text-text-tertiary'>
                                        {create.isPending ? <Skeleton className='h-4 w-48' /> : settingsLine(invite)}
                                    </div>
                                    <div className='flex'>
                                        <Button
                                            type='button'
                                            variant='text'
                                            size='sm'
                                            className='text-danger'
                                            onClick={() => void revoke()}
                                        >
                                            {t('invite.revoke')}
                                        </Button>
                                        <Button
                                            type='button'
                                            variant='text'
                                            size='sm'
                                            onClick={() => setEditing(settings)}
                                        >
                                            {t('invite.editSettings')}
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                            {revokeFailed ? <FormMessage tone='danger'>{t('invite.revokeFailed')}</FormMessage> : null}
                        </div>
                        <DialogFooter>
                            <Button type='button' variant='secondary' onClick={hide}>
                                {t('invite.done')}
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

const sameAs = (a: InviteSettings, b: InviteSettings) => a.maxAgeSeconds === b.maxAgeSeconds && a.maxUses === b.maxUses

/** S-SRV-02 `edit-settings`: lifetime and uses, then "Create a new link". */
function EditSettings({
    current,
    value,
    onChange,
    onBack,
    onSubmit,
    creating
}: {
    current: Invite | null
    value: InviteSettings
    onChange: (value: InviteSettings) => void
    onBack: () => void
    onSubmit: () => void
    creating: boolean
}) {
    const { t } = useTranslation('servers')
    // The same as the link shown and no limit on uses: it would come back as it is (D-151).
    const unchanged = current !== null && sameSettings(current, value)

    function submit(event: FormEvent) {
        event.preventDefault()
        if (!unchanged && !creating) onSubmit()
    }

    const submitButton = (
        <Button type='submit' disabled={unchanged || creating}>
            {creating ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
            {t('invite.settings.submit')}
        </Button>
    )

    return (
        <form onSubmit={submit} className='grid gap-4' noValidate>
            <div>
                <Button type='button' variant='text' size='sm' className='-ml-3' onClick={onBack}>
                    <ArrowLeft aria-hidden='true' />
                    {t('invite.settings.back')}
                </Button>
            </div>
            <DialogHeader>
                <DialogTitle>{t('invite.settings.title')}</DialogTitle>
            </DialogHeader>
            <div className='grid gap-1'>
                <Label htmlFor='invite-expiry' className='text-label text-text-secondary'>
                    {t('invite.settings.expiry')}
                </Label>
                <Select
                    id='invite-expiry'
                    value={ageValue(value.maxAgeSeconds)}
                    onValueChange={(chosen) =>
                        onChange({
                            ...value,
                            maxAgeSeconds: INVITE_MAX_AGES.find((age) => ageValue(age) === chosen) ?? null
                        })
                    }
                    options={INVITE_MAX_AGES.map((age) => ({
                        value: ageValue(age),
                        label: age === null ? t('invite.age.never') : t(AGE_LABELS[age])
                    }))}
                />
            </div>
            <div className='grid gap-1'>
                <Label htmlFor='invite-uses' className='text-label text-text-secondary'>
                    {t('invite.settings.uses')}
                </Label>
                <Select
                    id='invite-uses'
                    value={usesValue(value.maxUses)}
                    onValueChange={(chosen) =>
                        onChange({ ...value, maxUses: chosen === 'unlimited' ? null : Number(chosen) })
                    }
                    options={INVITE_MAX_USES.map((uses) => ({
                        value: usesValue(uses),
                        label:
                            uses === null
                                ? t('invite.usesOption.unlimited')
                                : t('invite.usesOption.count', { count: uses })
                    }))}
                />
            </div>
            <p className='text-label text-text-tertiary'>{t('invite.settings.note')}</p>
            <DialogFooter>
                <Button type='button' variant='text' onClick={onBack}>
                    {t('invite.settings.cancel')}
                </Button>
                {unchanged ? <WithTooltip label={t('invite.settings.same')}>{submitButton}</WithTooltip> : submitButton}
            </DialogFooter>
        </form>
    )
}
