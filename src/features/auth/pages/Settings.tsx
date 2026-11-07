import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ShellPage } from '@/components/shell/ShellPage'
import { FormField } from '@/components/form/FormField'
import { useAuthStore } from '@/features/auth/auth.store'
import { useChangePassword } from '@/features/auth/api/useChangePassword'
import { authFormError } from '@/features/auth/lib/form-errors'
import { newPasswordCheck, passwordFieldMessage } from '@/features/auth/lib/schemas'
import type { PasswordContext, PasswordRule } from '@/features/auth/lib/password-rules'
import { Notice } from '@/features/auth/components/AuthCard'
import { SessionsSection } from '@/features/auth/components/SessionsSection'
import { SettingsGroup, SettingsRow } from '@/components/settings/SettingsRow'
import { PasswordInput } from '@/features/auth/components/PasswordInput'
import { PasswordRules } from '@/features/auth/components/PasswordRules'

const createSchema = (t: TFunction<'auth'>, identity: PasswordContext) =>
    z
        .object({
            currentPassword: z.string().min(1, t('validation.passwordRequired')),
            password: z.string(),
            confirmPassword: z.string()
        })
        .superRefine((values, ctx) => newPasswordCheck(t, values, identity, ctx))

type Values = z.infer<ReturnType<typeof createSchema>>

/** The account settings page (S-ME-03): sign-in, password and sessions, in the AppShell. */
export default function Settings() {
    const { t } = useTranslation('auth')
    return (
        <ShellPage title={t('settings.title')}>
            <SettingsContent />
        </ShellPage>
    )
}

function SettingsContent() {
    const { t } = useTranslation('auth')
    const user = useAuthStore((state) => state.user)
    const changePassword = useChangePassword()
    const [formError, setFormError] = useState<string | null>(null)
    const [serverRules, setServerRules] = useState<PasswordRule[]>([])
    const schema = useMemo(
        () => createSchema(t, { email: user?.email, username: user?.username }),
        [t, user?.email, user?.username]
    )
    const {
        register,
        handleSubmit,
        control: formControl,
        reset,
        setError,
        formState: { errors, isSubmitting }
    } = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: { currentPassword: '', password: '', confirmPassword: '' }
    })

    const password = useWatch({ control: formControl, name: 'password' })

    async function onSubmit(values: Values) {
        setFormError(null)
        setServerRules([])
        try {
            await changePassword.mutateAsync({ currentPassword: values.currentPassword, newPassword: values.password })
            reset()
            toast.success(t('settings.changePassword.done'))
        } catch (error) {
            const failure = authFormError(error)
            if (failure.type === 'AUTH_CURRENT_PASSWORD_INVALID') {
                setError('currentPassword', { message: failure.message })
            } else if (failure.passwordRules.length > 0) {
                setServerRules(failure.passwordRules)
            } else {
                setFormError(failure.message)
            }
        }
    }

    return (
        <div className='max-w-[720px] space-y-8 p-6 lg:p-8'>
            <SettingsGroup id='sign-in' title={t('settings.signIn.title')}>
                <SettingsRow
                    label={t('settings.signIn.email')}
                    value={user?.email}
                    description={t('settings.signIn.emailHint')}
                />
                {/* Every account has a password (D-130). L11 moves the form into a dialog opened from this row. */}
                <SettingsRow label={t('settings.signIn.password')} description={t('settings.signIn.passwordHint')} />
                <div className='space-y-4' role='group' aria-label={t('settings.changePassword.title')}>
                    {formError ? <Notice tone='error'>{formError}</Notice> : null}
                    <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
                        {/* What a password manager files the new password under. */}
                        <input type='email' autoComplete='username' value={user?.email ?? ''} readOnly hidden />
                        <FormField label={t('fields.currentPassword')} error={errors.currentPassword?.message}>
                            {(control) => (
                                <PasswordInput
                                    autoComplete='current-password'
                                    {...control}
                                    {...register('currentPassword')}
                                />
                            )}
                        </FormField>
                        <div className='space-y-2'>
                            <FormField
                                label={t('fields.newPassword')}
                                error={errors.password?.message ?? passwordFieldMessage(t, serverRules)}
                            >
                                {(control) => (
                                    <PasswordInput
                                        autoComplete='new-password'
                                        {...control}
                                        {...register('password', { onChange: () => setServerRules([]) })}
                                    />
                                )}
                            </FormField>
                            <PasswordRules
                                password={password}
                                serverRules={serverRules}
                                showErrors={Boolean(errors.password)}
                            />
                        </div>
                        <FormField label={t('fields.confirmPassword')} error={errors.confirmPassword?.message}>
                            {(control) => (
                                <PasswordInput
                                    autoComplete='new-password'
                                    {...control}
                                    {...register('confirmPassword')}
                                />
                            )}
                        </FormField>
                        <Button type='submit' disabled={isSubmitting}>
                            {isSubmitting
                                ? t('settings.changePassword.submitting')
                                : t('settings.changePassword.submit')}
                        </Button>
                    </form>
                </div>
            </SettingsGroup>

            <SessionsSection />
        </div>
    )
}
