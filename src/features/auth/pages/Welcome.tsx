import { useEffect, useId, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Trans, useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowBigUp, CircleCheck, Loader2, OctagonX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { FormField } from '@/components/form/FormField'
import { FormMessage } from '@/components/form/FormMessage'
import { TimeZoneCombobox } from '@/components/form/TimeZoneCombobox'
import { PageLoader } from '@/components/PageLoader'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { initialTimeZone, timeIn } from '@/lib/time-zones'
import { displayNameIssue, USERNAME_PATTERN, useProfile, userKeys, useUsernameAvailability } from '@/features/users'
import { authApi } from '@/features/auth/api/auth.api'
import { useAuthStore } from '@/features/auth/auth.store'
import { safeNext } from '@/features/auth/lib/paths'
import { useAuthPageState } from '@/features/auth/lib/page-state'
import { passwordFieldRule, type PasswordRule } from '@/features/auth/lib/password-rules'
import { newPasswordIssue } from '@/features/auth/lib/schemas'
import { requestFailure, useMessageText, type RequestFailure } from '@/features/auth/lib/form-problem'
import { usernameFromEmail } from '@/features/auth/lib/username-prefill'
import { AuthCard } from '@/features/auth/components/AuthCard'
import { PasswordInput } from '@/features/auth/components/PasswordInput'
import { PasswordRules } from '@/features/auth/components/PasswordRules'

/** A link in the terms sentence: opens in a new tab, the form stays as it is (01 Q12). */
function NewTabLink({ href, children }: { href: string; children?: ReactNode }) {
    return (
        <a href={href} target='_blank' rel='noopener noreferrer' className='font-semibold text-primary hover:underline'>
            {children}
        </a>
    )
}

/**
 * The form's rules. Messages are keys, put into words when shown
 * (form-problem.ts). `email` is what the password may not be (D-66), with the
 * username being chosen.
 */
const createSchema = (email: string | undefined) =>
    z
        .object({
            displayName: z.string(),
            username: z.string(),
            password: z.string(),
            timezone: z.string(),
            termsAccepted: z.boolean()
        })
        .superRefine((values, ctx) => {
            const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
            // The profile page's rules and words (REQ-AUTH-06, D-139).
            const nameIssue = displayNameIssue(values.displayName)
            if (nameIssue === 'required') issue('displayName', 'users:validation.displayNameRequired')
            else if (nameIssue === 'tooLong') issue('displayName', 'users:validation.displayNameTooLong')

            if (!values.username) issue('username', 'auth:welcome.usernameRequired')
            else if (!USERNAME_PATTERN.test(values.username)) issue('username', 'auth:welcome.usernameInvalid')

            const passwordIssue = newPasswordIssue(values.password, { email, username: values.username })
            if (passwordIssue) issue('password', passwordIssue)

            if (!values.termsAccepted) issue('termsAccepted', 'auth:welcome.termsRequired')
        })

type Values = z.infer<ReturnType<typeof createSchema>>

/**
 * "Complete your account" (S-ONB-01, D-61): the one step every new account
 * goes through before the app — display name, username, password, time zone,
 * the language at the foot of the page, and agreeing to the terms (all
 * required, D-69). Until it is done the API answers ACCOUNT_INCOMPLETE to
 * everything else, and the router sends here.
 */
export default function Welcome() {
    const profile = useProfile()
    const storedEmail = useAuthStore((state) => state.user?.email)

    // Normally in the cache already (filled at sign-in); a moment otherwise.
    if (profile.isPending) return <PageLoader className='min-h-40' />
    return <WelcomeForm email={profile.data?.email ?? storedEmail} googleName={profile.data?.displayName ?? ''} />
}

function WelcomeForm({ email, googleName }: { email: string | undefined; googleName: string }) {
    const { t } = useTranslation('auth')
    const text = useMessageText()
    const navigate = useNavigate()
    const [params] = useSearchParams()
    const { via } = useAuthPageState()
    const queryClient = useQueryClient()
    const markComplete = useAuthStore((state) => state.markComplete)
    const [problem, setProblem] = useState<RequestFailure | null>(null)
    const [serverRules, setServerRules] = useState<PasswordRule[]>([])
    // The username filled in from the email, until the person changes it:
    // taken, it is emptied without an error they did not cause.
    const [prefilled, setPrefilled] = useState(() => usernameFromEmail(email))
    const termsId = useId()
    // While the password field has the focus (C-22, 01 Q14): a hint, not an error.
    const [capsLock, setCapsLock] = useState(false)
    useDocumentTitle(t('welcome.tab'))

    const schema = createSchema(email)
    const {
        register,
        handleSubmit,
        control,
        setFocus,
        setValue,
        setError,
        clearErrors,
        formState: { errors, isSubmitting, isSubmitted }
    } = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: {
            // From Google, already trimmed and cut to 32 by the API (S-AUTH-05 `from-google`).
            displayName: googleName,
            username: prefilled,
            password: '',
            timezone: initialTimeZone(),
            termsAccepted: false
        }
    })
    const [username, password, timezone] = useWatch({ control, name: ['username', 'password', 'timezone'] })
    // "Time there now", to check the pick against the clock where one is.
    const now = useMinuteClock()
    // Registered here, in the order on screen: a failed submit focuses the
    // first field in this order (a field registered inside FormField's render
    // came after the checkbox).
    const displayNameField = register('displayName')
    const usernameField = register('username', {
        onChange: () => {
            setPrefilled('')
            clearErrors('username')
        }
    })
    const passwordField = register('password', { onChange: () => setServerRules([]) })
    const termsField = register('termsAccepted')
    const availability = useUsernameAvailability(username)

    useEffect(() => {
        // A name from Google is there already: the password is next.
        setFocus(googleName ? 'password' : 'displayName')
    }, [googleName, setFocus])

    useEffect(() => {
        if (prefilled && username === prefilled && availability.isAvailable === false) {
            setPrefilled('')
            setValue('username', '')
        }
    }, [availability.isAvailable, prefilled, setValue, username])

    function finish() {
        markComplete()
        // The Study page greets a new account once (02 S-SHELL-01 `no-server-first`).
        void navigate(safeNext(params.get('next')), { replace: true, state: { firstVisit: true } })
    }

    async function onSubmit(values: Values) {
        setProblem(null)
        setServerRules([])
        if (availability.isAvailable === false) {
            setError('username', { message: 'auth:welcome.usernameTaken' }, { shouldFocus: true })
            return
        }
        try {
            await authApi.completeAccount({
                displayName: values.displayName.trim(),
                username: values.username,
                password: values.password,
                timezone: values.timezone,
                termsAccepted: true
            })
            finish()
        } catch (error) {
            const failure = requestFailure(error)
            // Done meanwhile, in another tab.
            if (failure.type === 'ACCOUNT_ALREADY_COMPLETE') return finish()
            if (failure.type === 'USERNAME_CONFLICT') {
                // Taken after it was checked (AUTH-EDGE username-taken-on-submit).
                queryClient.setQueryData(userKeys.usernameAvailability(values.username), false)
                setError('username', { message: 'auth:welcome.usernameTakenNow' }, { shouldFocus: true })
                return
            }
            if (failure.passwordRules.length > 0) {
                setServerRules(failure.passwordRules)
                const fieldRule = passwordFieldRule(failure.passwordRules)
                const message = fieldRule ? `auth:passwordRules.${fieldRule}` : 'auth:validation.passwordWeak'
                setError('password', { message }, { shouldFocus: true })
                return
            }
            setProblem(failure)
        }
    }

    // One line under the username (C-22): the error, else the check, else the rule.
    const usernameError = errors.username?.message
        ? text({ key: errors.username.message })
        : availability.isAvailable === false && username !== prefilled
          ? t('welcome.usernameTaken')
          : undefined
    const usernameStatus = availability.isTyping ? null : availability.isChecking ? (
        <>
            <Loader2 className='mt-[3px] size-3.5 shrink-0 animate-spin' aria-hidden='true' />
            {t('welcome.usernameChecking')}
        </>
    ) : availability.isAvailable ? (
        t('welcome.usernameAvailable')
    ) : availability.checkFailed ? (
        t('welcome.usernameCheckFailed')
    ) : null

    const termsError = errors.termsAccepted?.message ? text({ key: errors.termsAccepted.message }) : undefined

    return (
        <AuthCard
            title={t('welcome.title')}
            subtitle={email ? t(via === 'google' ? 'welcome.subtitleGoogle' : 'welcome.subtitle', { email }) : null}
        >
            <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
                <FormField
                    label={t('profile.displayName', { ns: 'users' })}
                    error={errors.displayName?.message ? text({ key: errors.displayName.message }) : undefined}
                    hint={t('profile.displayNameHint', { ns: 'users' })}
                >
                    {(field) => (
                        <Input
                            autoComplete='nickname'
                            placeholder={t('welcome.displayNamePlaceholder')}
                            readOnly={isSubmitting}
                            {...field}
                            {...displayNameField}
                        />
                    )}
                </FormField>

                <FormField
                    label={t('welcome.username')}
                    error={usernameError}
                    status={usernameStatus}
                    hint={t('welcome.usernameHint')}
                >
                    {(field) => (
                        <div className='relative'>
                            <Input
                                autoComplete='username'
                                spellCheck={false}
                                autoCapitalize='none'
                                readOnly={isSubmitting}
                                className='pr-10'
                                {...field}
                                {...usernameField}
                                aria-invalid={Boolean(usernameError)}
                                onChange={(event) => {
                                    // Upper case becomes lower case as it is typed (C-22 › username).
                                    event.target.value = event.target.value.toLowerCase()
                                    void usernameField.onChange(event)
                                }}
                            />
                            {availability.isAvailable && !usernameError ? (
                                <CircleCheck
                                    className='absolute right-3 top-3 size-4 text-success'
                                    aria-hidden='true'
                                />
                            ) : null}
                        </div>
                    )}
                </FormField>

                <div className='space-y-2'>
                    <FormField
                        label={t('welcome.password')}
                        error={errors.password?.message ? text({ key: errors.password.message }) : undefined}
                        status={
                            capsLock ? (
                                <>
                                    <ArrowBigUp className='mt-[3px] size-3.5 shrink-0' aria-hidden='true' />
                                    {t('fields.capsLock')}
                                </>
                            ) : null
                        }
                    >
                        {(field) => (
                            <PasswordInput
                                autoComplete='new-password'
                                readOnly={isSubmitting}
                                {...field}
                                {...passwordField}
                                onKeyDown={(event) => setCapsLock(event.getModifierState('CapsLock'))}
                                onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))}
                                onBlur={(event) => {
                                    setCapsLock(false)
                                    void passwordField.onBlur(event)
                                }}
                            />
                        )}
                    </FormField>
                    <PasswordRules
                        password={password}
                        serverRules={serverRules}
                        showErrors={isSubmitted && Boolean(errors.password)}
                    />
                </div>

                <FormField
                    label={t('welcome.timeZone')}
                    hint={t('welcome.timeZoneNow', { time: timeIn(timezone, now) })}
                >
                    {(field) => (
                        <Controller
                            control={control}
                            name='timezone'
                            render={({ field: zone }) => (
                                <TimeZoneCombobox
                                    {...field}
                                    ref={zone.ref}
                                    value={zone.value}
                                    onChange={zone.onChange}
                                />
                            )}
                        />
                    )}
                </FormField>

                <div className='space-y-1'>
                    <div className='flex items-start gap-2 text-body-sm text-text-secondary'>
                        <Checkbox
                            id={termsId}
                            className='mt-px'
                            aria-invalid={Boolean(termsError)}
                            aria-describedby={termsError ? 'terms-error' : undefined}
                            {...termsField}
                        />
                        {/* The sentence ticks the box too, except its two links (C-24b). */}
                        <label htmlFor={termsId} className='cursor-pointer'>
                            <Trans
                                t={t}
                                i18nKey='welcome.terms'
                                components={{
                                    terms: <NewTabLink href='/terms' />,
                                    privacy: <NewTabLink href='/privacy' />
                                }}
                            />
                        </label>
                    </div>
                    {termsError ? (
                        <p id='terms-error' role='alert' className='flex gap-1.5 pl-[26px] text-label text-danger'>
                            <OctagonX className='mt-[3px] size-3.5 shrink-0' aria-hidden='true' />
                            <span>{termsError}</span>
                        </p>
                    ) : null}
                </div>

                {problem ? (
                    <FormMessage tone='danger' icon={problem.offline ? 'wifi-off' : undefined}>
                        {text(problem.message)}
                    </FormMessage>
                ) : null}
                <Button type='submit' className='w-full' disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                    {t('welcome.submit')}
                </Button>
            </form>
        </AuthCard>
    )
}
