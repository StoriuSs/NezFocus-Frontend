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
import { useLogoutEverywhere } from '@/features/auth/api/useLogoutEverywhere'
import { authFormError } from '@/features/auth/lib/form-errors'
import { newPasswordCheck, passwordFieldMessage } from '@/features/auth/lib/schemas'
import type { PasswordContext, PasswordRule } from '@/features/auth/lib/password-rules'
import { Notice } from '@/features/auth/components/AuthCard'
import { PasswordInput } from '@/features/auth/components/PasswordInput'
import { PasswordRules } from '@/features/auth/components/PasswordRules'
import { SetPasswordSettings } from '@/features/auth/components/SetPasswordSettings'
import { useSignInMethods } from '@/features/auth/api/useSignInMethods'

const createSchema = (t: TFunction<'auth'>, identity: PasswordContext) =>
    z
        .object({
            currentPassword: z.string().min(1, t('validation.passwordRequired')),
            password: z.string(),
            confirmPassword: z.string()
        })
        .superRefine((values, ctx) => newPasswordCheck(t, values, identity, ctx))

type Values = z.infer<ReturnType<typeof createSchema>>

/** The signed-in user's password and sessions. */
/** The account settings page (S-ME-03 in L10–L11), in the AppShell. */
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
    const logout = useAuthStore((state) => state.logout)
    const changePassword = useChangePassword()
    const logoutEverywhere = useLogoutEverywhere()
    const [formError, setFormError] = useState<string | null>(null)
    const [serverRules, setServerRules] = useState<PasswordRule[]>([])
    const [signingOut, setSigningOut] = useState(false)
    const [signOutError, setSignOutError] = useState<string | null>(null)
    // Every device, this one included: asked once more before it happens.
    const [confirmingSignOut, setConfirmingSignOut] = useState(false)
    // How the account signs in: one made with Google has no password to change.
    const methods = useSignInMethods()
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

    /**
     * Only once the API has ended every session: if the request fails, the
     * other devices are still signed in, so this one stays signed in too and
     * says so, rather than looking done when it is not.
     */
    async function signOutEverywhere() {
        setSignOutError(null)
        setSigningOut(true)
        try {
            await logoutEverywhere.mutateAsync()
        } catch (error) {
            setSignOutError(t('settings.sessions.failed', { message: authFormError(error).message }))
            setSigningOut(false)
            return
        }
        logout('you-signed-out-everywhere')
    }

    return (
        <div className='max-w-[720px] space-y-8 p-6 lg:p-8'>
            <p className='text-text-secondary'>{t('settings.subtitle')}</p>

            {/* Until the answer is in, neither form: "Change password" is wrong for an account made with Google. */}
            {methods.isPending ? (
                <section className='rounded-xl border bg-background p-6' aria-busy='true'>
                    <p className='text-sm text-muted-foreground'>{t('settings.methodsLoading')}</p>
                </section>
            ) : methods.isError ? (
                <section className='space-y-3 rounded-xl border bg-background p-6'>
                    <Notice tone='error'>{t('settings.methodsFailed')}</Notice>
                    <Button variant='outline' onClick={() => void methods.refetch()}>
                        {t('settings.retry')}
                    </Button>
                </section>
            ) : methods.data.password === false ? (
                <SetPasswordSettings email={user?.email} providers={methods.data.providers} />
            ) : (
                <section className='space-y-4 rounded-xl border bg-background p-6' aria-labelledby='change-password'>
                    <div className='space-y-1'>
                        <h2 id='change-password' className='text-lg font-semibold'>
                            {t('settings.changePassword.title')}
                        </h2>
                        <p className='text-sm text-muted-foreground'>{t('settings.changePassword.description')}</p>
                    </div>
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
                </section>
            )}

            <section className='space-y-4 rounded-xl border bg-background p-6' aria-labelledby='sign-out-everywhere'>
                <div className='space-y-1'>
                    <h2 id='sign-out-everywhere' className='text-lg font-semibold'>
                        {t('settings.sessions.title')}
                    </h2>
                    <p className='text-sm text-muted-foreground'>{t('settings.sessions.description')}</p>
                </div>
                {signOutError ? <Notice tone='error'>{signOutError}</Notice> : null}
                {confirmingSignOut ? (
                    <div
                        className='space-y-3 rounded-lg border p-4'
                        role='group'
                        aria-label={t('settings.sessions.title')}
                    >
                        <p className='text-sm font-medium'>{t('settings.sessions.confirm')}</p>
                        <div className='flex flex-wrap gap-2'>
                            <Button
                                variant='destructive'
                                disabled={signingOut}
                                onClick={() => void signOutEverywhere()}
                            >
                                {signingOut ? t('settings.sessions.submitting') : t('settings.sessions.confirmYes')}
                            </Button>
                            <Button variant='ghost' disabled={signingOut} onClick={() => setConfirmingSignOut(false)}>
                                {t('settings.sessions.cancel')}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button variant='outline' onClick={() => setConfirmingSignOut(true)}>
                        {t('settings.sessions.submit')}
                    </Button>
                )}
            </section>
        </div>
    )
}
