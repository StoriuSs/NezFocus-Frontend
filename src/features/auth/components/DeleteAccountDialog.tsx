import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import '@/i18n/deletion'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { FormField } from '@/components/form/FormField'
import { FormMessage } from '@/components/form/FormMessage'
import { useCountdown } from '@/hooks/useCountdown'
import { userKeys, type UserSettings } from '@/features/users'
import { useDeleteAccount } from '@/features/auth/api/useDeleteAccount'
import { useAuthStore } from '@/features/auth/auth.store'
import { DELETION_WAIT_MS, deletionDate } from '@/features/auth/lib/deletion-date'
import { formatWait } from '@/features/auth/lib/form-errors'
import { requestFailure, useMessageText, type RequestFailure } from '@/features/auth/lib/form-problem'
import { sendResetCode } from '@/features/auth/lib/reset-code'
import type { Limit } from '@/features/auth/hooks/useCodeReset'
import { PasswordInput } from './PasswordInput'

/**
 * "Delete account?" (10-settings › S-ME-03 `delete-confirm`, REQ-AUTH-09,
 * D-141): what deleting means and the day the account goes, then the
 * password before anything happens. Nothing is deleted for 14 days: signing
 * in before then restores it. Done, every session ends and this browser
 * lands on sign in, whose banner gives the day again.
 *
 * Wrong passwords count as when changing it: five in 15 minutes and the
 * button waits it out (D-121). "Forgot password?" sends a reset code and
 * hands over to the password dialog (`onForgot`), which hands back here.
 */
export function DeleteAccountDialog({
    email,
    open,
    onOpenChange,
    onForgot
}: {
    email: string
    open: boolean
    onOpenChange: (open: boolean) => void
    onForgot: (failure: RequestFailure | null) => void
}) {
    const { t } = useTranslation('deletion')
    const tAuth = useTranslation('auth').t
    const text = useMessageText()
    const logout = useAuthStore((state) => state.logout)
    // Read only: the AppShell loads the account's settings as the app opens.
    const timeZone = useQuery<UserSettings>({ queryKey: userKeys.settings(), enabled: false }).data?.timezone
    const deleteAccount = useDeleteAccount()
    const [problem, setProblem] = useState<RequestFailure | null>(null)
    const [limit, setLimit] = useState<Limit | null>(null)
    const [sendingCode, setSendingCode] = useState(false)
    const wait = useCountdown(limit?.until)
    const limited = limit !== null && wait > 0
    // When the dialog opened: the day it names is the day the request would set.
    const [deletesOn] = useState(() => deletionDate(new Date(Date.now() + DELETION_WAIT_MS), timeZone))

    const {
        register,
        handleSubmit,
        control,
        setError,
        setFocus,
        formState: { errors, isSubmitting }
    } = useForm<{ password: string }>({ defaultValues: { password: '' } })
    const password = useWatch({ control, name: 'password' })
    const busy = isSubmitting || sendingCode

    async function submit({ password: value }: { password: string }) {
        setProblem(null)
        try {
            const deletesAt = await deleteAccount.mutateAsync(value)
            logout('account-deleted', undefined, deletesAt)
        } catch (error) {
            const failure = requestFailure(error)
            if (failure.limit) setLimit(failure.limit)
            else if (failure.type === 'AUTH_CURRENT_PASSWORD_INVALID') {
                setError('password', { message: t('confirm.wrongPassword') }, { shouldFocus: true })
            } else setProblem(failure)
        }
    }

    async function forgot() {
        setSendingCode(true)
        const failure = await sendResetCode(email)
        setSendingCode(false)
        onForgot(failure)
    }

    return (
        <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : !busy && onOpenChange(false))}>
            <DialogContent
                className='sm:max-w-[440px]'
                // The password, not "Forgot password?" before it (S-ME-03 `delete-confirm`).
                onOpenAutoFocus={(event) => {
                    event.preventDefault()
                    setFocus('password')
                }}
            >
                <form onSubmit={(event) => void handleSubmit(submit)(event)} className='space-y-4' noValidate>
                    <DialogHeader>
                        <DialogTitle>{t('confirm.title')}</DialogTitle>
                        <DialogDescription>{t('confirm.description', { date: deletesOn })}</DialogDescription>
                    </DialogHeader>
                    {/* What a password manager fills the password in for. */}
                    <input type='email' autoComplete='username' value={email} readOnly hidden />
                    <FormField
                        label={tAuth('fields.password')}
                        error={errors.password?.message}
                        action={
                            <button
                                type='button'
                                className='font-semibold text-primary hover:underline'
                                disabled={busy}
                                onClick={() => void forgot()}
                            >
                                {tAuth('settings.changePassword.forgot')}
                            </button>
                        }
                    >
                        {(field) => (
                            <PasswordInput
                                autoComplete='current-password'
                                readOnly={isSubmitting}
                                {...field}
                                {...register('password')}
                            />
                        )}
                    </FormField>
                    {limited ? (
                        <FormMessage tone='neutral' icon='clock'>
                            {t('confirm.tooManyWrong', { wait: formatWait(wait) })}
                        </FormMessage>
                    ) : problem ? (
                        <FormMessage tone='danger' icon={problem.offline ? 'wifi-off' : undefined}>
                            {text(problem.message)}
                        </FormMessage>
                    ) : null}
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type='button' variant='text' disabled={busy}>
                                {t('confirm.cancel')}
                            </Button>
                        </DialogClose>
                        {/* Off until the password is typed (C-14 `password`, as the base). */}
                        <Button type='submit' variant='destructive' disabled={!password || busy || limited}>
                            {isSubmitting ? <Loader2 className='mr-2 h-4 w-4 animate-spin' aria-hidden='true' /> : null}
                            {t('confirm.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
