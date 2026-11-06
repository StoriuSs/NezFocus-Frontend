import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog'
import { FormField } from '@/components/form/FormField'
import { useDeleteAccount } from '@/features/auth/api/useDeleteAccount'
import { useAuthStore } from '@/features/auth/auth.store'
import { authFormError } from '@/features/auth/lib/form-errors'
import { Notice } from '@/features/auth/components/AuthCard'
import { PasswordInput } from '@/features/auth/components/PasswordInput'

const createSchema = (t: TFunction<'auth'>) =>
    z.object({ password: z.string().min(1, t('validation.passwordRequired')) })

type Values = z.input<ReturnType<typeof createSchema>>

/**
 * "Delete account", for the profile page: a dialog that says what deleting
 * means and asks for the password before anything happens. Every account has
 * one (D-130). A signed-in session alone is not enough: the API refuses
 * without it (the backend's POST /auth/account/delete).
 */
export function DeleteAccountDialog() {
    const { t } = useTranslation('auth')
    const email = useAuthStore((state) => state.user?.email)
    const logout = useAuthStore((state) => state.logout)
    const [open, setOpen] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const deleteAccount = useDeleteAccount()

    const schema = useMemo(() => createSchema(t), [t])
    const {
        register,
        handleSubmit,
        control,
        reset,
        setError,
        formState: { errors, isSubmitting }
    } = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: { password: '' }
    })
    const password = useWatch({ control, name: 'password' })

    function onOpenChange(next: boolean) {
        setOpen(next)
        if (!next) {
            reset()
            setFormError(null)
        }
    }

    async function onSubmit(values: Values) {
        setFormError(null)
        try {
            await deleteAccount.mutateAsync(values.password)
            logout('account-deleted')
        } catch (error) {
            const failure = authFormError(error)
            if (failure.type === 'AUTH_CURRENT_PASSWORD_INVALID') {
                setError('password', { message: t('deleteAccount.wrongPassword') })
            } else {
                setFormError(failure.message)
            }
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button variant='destructive' size='sm'>
                    <Trash2 className='mr-2 h-4 w-4' />
                    {t('deleteAccount.open')}
                </Button>
            </DialogTrigger>
            <DialogContent className='sm:max-w-[440px]'>
                <DialogHeader>
                    <DialogTitle className='text-destructive'>{t('deleteAccount.title')}</DialogTitle>
                    <DialogDescription>{t('deleteAccount.description')}</DialogDescription>
                </DialogHeader>
                {formError ? <Notice tone='error'>{formError}</Notice> : null}
                <form id='delete-account' onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
                    {/* What a password manager fills the password in for. */}
                    <input type='email' autoComplete='username' value={email ?? ''} readOnly hidden />
                    <p className='text-sm'>{t('deleteAccount.confirmWithPassword')}</p>
                    <FormField label={t('fields.password')} error={errors.password?.message}>
                        {(field) => (
                            <PasswordInput autoComplete='current-password' {...field} {...register('password')} />
                        )}
                    </FormField>
                </form>
                <DialogFooter className='mt-2'>
                    <Button variant='outline' onClick={() => onOpenChange(false)}>
                        {t('deleteAccount.cancel')}
                    </Button>
                    <Button
                        type='submit'
                        form='delete-account'
                        variant='destructive'
                        disabled={password.length === 0 || isSubmitting}
                    >
                        {isSubmitting ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
                        {isSubmitting ? t('deleteAccount.submitting') : t('deleteAccount.submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
