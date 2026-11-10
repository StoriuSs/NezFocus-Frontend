import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Textarea } from '@/components/ui/textarea'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { getApiErrorType } from '@/lib/api-error'
import { cn } from '@/lib/utils'
import { userKeys, type UserSettings } from '@/features/users'
import { useBanMember, useKickMember, useTimeoutMember } from '../../../api/useModeration'
import { refusedRule } from '../../../lib/layout-error'
import {
    DEFAULT_TIMEOUT,
    endsAt,
    isTimedOut,
    REASON_MAX_LENGTH,
    TIMEOUT_SECONDS,
    type TimeoutSeconds
} from '../../../lib/moderation'
import type { ServerMember } from '../../../types'
import { memberName } from '../roles/RoleMembers'

export type Moderation = 'timeout' | 'kick' | 'ban'

/** Why a dialog's action failed (04 › Lỗi gửi hộp thoại); all but `failed` leave nothing to retry. */
type Failure = 'failed' | 'outranked' | 'gone' | 'admin'

function failureOf(error: unknown): Failure {
    const type = getApiErrorType(error)
    if (type === 'ROLE_HIERARCHY_VIOLATION') return 'outranked'
    if (type === 'NOT_FOUND_ERROR') return 'gone'
    if (refusedRule(error) === 'target_admin') return 'admin'
    return 'failed'
}

/** "Lý do (không bắt buộc)" with 0/512, and "Khánh sẽ thấy lý do này." under it; Ctrl + Enter sends. */
function ReasonField({
    name,
    value,
    onChange,
    onSubmit
}: {
    name: string
    value: string
    onChange: (value: string) => void
    onSubmit: () => void
}) {
    const { t } = useTranslation('servers')
    const id = useId()
    const count = value.trim().length
    return (
        <div className='grid gap-2'>
            <div className='flex items-center justify-between'>
                <Label htmlFor={id}>{t('members.dialog.reason')}</Label>
                <span
                    className={cn(
                        'tabular-nums text-label',
                        count >= REASON_MAX_LENGTH ? 'text-text-secondary' : 'text-text-tertiary'
                    )}
                >
                    {count}/{REASON_MAX_LENGTH}
                </span>
            </div>
            <Textarea
                id={id}
                value={value}
                maxLength={REASON_MAX_LENGTH}
                aria-describedby={`${id}-hint`}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault()
                        onSubmit()
                    }
                }}
            />
            <p id={`${id}-hint`} className='text-label text-text-tertiary'>
                {t('members.dialog.reasonHint', { name })}
            </p>
        </div>
    )
}

/**
 * The frame every moderation dialog shares (C-14): title, what will happen,
 * the fields, the failure line above the buttons, Hủy and the action.
 */
function ModerationDialog({
    title,
    body,
    children,
    failure,
    name,
    submit,
    danger,
    pending,
    onSubmit,
    onClose
}: {
    title: string
    body: string
    children: ReactNode
    failure: Failure | null
    name: string
    submit: string
    danger: boolean
    pending: boolean
    onSubmit: () => void
    onClose: () => void
}) {
    const { t } = useTranslation('servers')
    const blocked = failure !== null && failure !== 'failed'
    return (
        <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
            {/* Tạm khóa is a `form` dialog, 520, for its six lengths; Mời ra and Cấm are `simple`, 440 (04 › Hộp thoại). */}
            <DialogContent className={danger ? 'sm:max-w-dialog' : 'sm:max-w-[520px]'}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{body}</DialogDescription>
                </DialogHeader>
                {children}
                {failure ? <FormMessage tone='danger'>{t(`members.dialog.${failure}`, { name })}</FormMessage> : null}
                <DialogFooter>
                    <Button type='button' variant='text' disabled={pending} onClick={onClose}>
                        {t('members.dialog.cancel')}
                    </Button>
                    <Button
                        type='button'
                        variant={danger ? 'destructive' : 'default'}
                        disabled={pending || blocked}
                        onClick={onSubmit}
                    >
                        {pending ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {submit}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Tạm khóa (S-SET-03 `timeout-dialog`, Q8): six lengths, 1 hour first, "Hết
 * lúc …" for the one chosen, an optional reason. On someone timed out it
 * gives a new length, counted again from now.
 */
function TimeoutDialog({ serverId, member, onClose }: { serverId: string; member: ServerMember; onClose: () => void }) {
    const { t, i18n } = useTranslation('servers')
    const now = useMinuteClock()
    // Read only: the AppShell loads the account's settings as the app opens.
    const timeZone = useQuery<UserSettings>({ queryKey: userKeys.settings(), enabled: false }).data?.timezone
    const timeout = useTimeoutMember(serverId)
    const [seconds, setSeconds] = useState<TimeoutSeconds>(DEFAULT_TIMEOUT)
    const [reason, setReason] = useState('')
    const [failure, setFailure] = useState<Failure | null>(null)
    const name = memberName(member)
    const lengthId = useId()
    const ends = endsAt(new Date(now.getTime() + seconds * 1000), now, i18n.language, timeZone)

    function submit() {
        if (timeout.isPending) return
        setFailure(null)
        timeout.mutate(
            { userId: member.userId, seconds, reason: reason.trim() || null },
            {
                onSuccess: () => {
                    toast(t('members.toast.timedOut', { name, length: t(`members.lengths.${seconds}`) }))
                    onClose()
                },
                onError: (error) => setFailure(failureOf(error))
            }
        )
    }

    return (
        <ModerationDialog
            title={t(isTimedOut(member, now) ? 'members.dialog.changeTitle' : 'members.dialog.timeoutTitle', { name })}
            body={t('members.dialog.timeoutBody', { name })}
            failure={failure}
            name={name}
            submit={t('members.dialog.timeoutSubmit')}
            danger={false}
            pending={timeout.isPending}
            onSubmit={submit}
            onClose={onClose}
        >
            <div className='grid gap-2'>
                <Label id={lengthId}>{t('members.dialog.length')}</Label>
                <SegmentedControl
                    aria-labelledby={lengthId}
                    value={String(seconds)}
                    onValueChange={(value) => setSeconds(Number(value) as TimeoutSeconds)}
                    segments={TIMEOUT_SECONDS.map((length) => ({
                        value: String(length),
                        label: t(`members.lengths.${length}`)
                    }))}
                />
                <p className='text-label text-text-secondary'>
                    {ends.date
                        ? t('members.dialog.endsOn', { time: ends.time, date: ends.date })
                        : t('members.dialog.endsToday', { time: ends.time })}
                </p>
            </div>
            <ReasonField name={name} value={reason} onChange={setReason} onSubmit={submit} />
        </ModerationDialog>
    )
}

/** Mời ra (S-SET-03 `kick-confirm`) and Cấm (`ban-confirm`): both `danger`, with a reason. */
function RemoveDialog({
    kind,
    serverId,
    member,
    onClose
}: {
    kind: 'kick' | 'ban'
    serverId: string
    member: ServerMember
    onClose: () => void
}) {
    const { t } = useTranslation('servers')
    const kick = useKickMember(serverId)
    const ban = useBanMember(serverId)
    const action = kind === 'kick' ? kick : ban
    const [reason, setReason] = useState('')
    const [failure, setFailure] = useState<Failure | null>(null)
    const name = memberName(member)

    function submit() {
        if (action.isPending) return
        setFailure(null)
        action.mutate(
            { userId: member.userId, reason: reason.trim() || null },
            {
                onSuccess: () => {
                    toast(t(kind === 'kick' ? 'members.toast.kicked' : 'members.toast.banned', { name }))
                    onClose()
                },
                onError: (error) => setFailure(failureOf(error))
            }
        )
    }

    return (
        <ModerationDialog
            title={t(`members.dialog.${kind}Title`, { name })}
            body={t(`members.dialog.${kind}Body`, { name })}
            failure={failure}
            name={name}
            submit={t(`members.dialog.${kind}Submit`)}
            danger
            pending={action.isPending}
            onSubmit={submit}
            onClose={onClose}
        >
            <ReasonField name={name} value={reason} onChange={setReason} onSubmit={submit} />
        </ModerationDialog>
    )
}

/** The dialog of one row's ⋯ choice. */
export function ModerationDialogFor({
    kind,
    serverId,
    member,
    onClose
}: {
    kind: Moderation
    serverId: string
    member: ServerMember
    onClose: () => void
}) {
    if (kind === 'timeout') return <TimeoutDialog serverId={serverId} member={member} onClose={onClose} />
    return <RemoveDialog kind={kind} serverId={serverId} member={member} onClose={onClose} />
}
