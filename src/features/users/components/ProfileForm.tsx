import { useEffect, type ChangeEvent, type KeyboardEvent } from 'react'
import { useForm, useWatch, type UseFormRegisterReturn } from 'react-hook-form'
import { useBlocker } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/form/FormField'
import { SaveBar } from '@/components/settings/SaveBar'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { useUpdateProfile } from '@/features/users/api/useUpdateProfile'
import {
    BIO_MAX_LENGTH,
    DISPLAY_NAME_MAX_LENGTH,
    bioIssue,
    characterCount,
    cutTo,
    displayNameIssue,
    normaliseProfileText
} from '@/features/users/lib/profile-text'
import type { UserProfile } from '@/features/users/types'
import { cn } from '@/lib/utils'

interface Values {
    displayName: string
    bio: string
}

const savedValues = (profile: UserProfile): Values => ({
    displayName: profile.displayName ?? '',
    bio: profile.bio ?? ''
})

/** "2/32": `text-tertiary`, `text-secondary` once full (10-settings › Số và giờ). */
function Counter({ value, max }: { value: string; max: number }) {
    const count = characterCount(value)
    return (
        <span className={cn('font-numeric tabular-nums', count >= max ? 'text-text-secondary' : 'text-text-tertiary')}>
            {count}/{max}
        </span>
    )
}

/**
 * Typing stops at the limit; a paste over it is cut to the limit and says so
 * under the field (10-settings › Trường hợp biên).
 */
function limitTo(max: number, field: UseFormRegisterReturn, report: (pastedOver: boolean) => void) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const typed = event.target.value
        const cut = cutTo(typed, max)
        if (cut !== typed) event.target.value = cut
        report(cut !== typed && (event.nativeEvent as InputEvent).inputType === 'insertFromPaste')
        return field.onChange(event)
    }
}

/**
 * The text part of S-ME-02 (Q4): display name, username (read only, D-72)
 * and bio, edited in place. Any change shows the save bar; "Discard changes"
 * goes back to what is saved. Leaving with changes asks first (in the app,
 * `discard-confirm`; closing the tab, the browser's own question).
 *
 * A change saved from another tab or device shows up here while nothing is
 * being edited; while something is, it waits, so typing is never wiped.
 */
export function ProfileForm({ profile }: { profile: UserProfile }) {
    const { t } = useTranslation('users')
    const updateProfile = useUpdateProfile()
    const {
        register,
        handleSubmit,
        control,
        reset,
        setError,
        clearErrors,
        formState: { errors, isDirty, isSubmitting }
    } = useForm<Values>({ defaultValues: savedValues(profile) })
    const [displayName, bio] = useWatch({ control, name: ['displayName', 'bio'] })

    const { displayName: savedName, bio: savedBio } = profile
    useEffect(() => {
        if (!isDirty) reset({ displayName: savedName ?? '', bio: savedBio ?? '' })
    }, [savedName, savedBio, isDirty, reset])

    useEffect(() => {
        if (!isDirty) return
        const ask = (event: BeforeUnloadEvent) => event.preventDefault()
        window.addEventListener('beforeunload', ask)
        return () => window.removeEventListener('beforeunload', ask)
    }, [isDirty])

    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname
    )

    const save = handleSubmit(async (values) => {
        if (!isDirty) return
        const nameIssue = displayNameIssue(values.displayName)
        if (nameIssue) return setError('displayName', { message: nameIssue }, { shouldFocus: true })
        if (bioIssue(values.bio)) return setError('bio', { message: 'tooLong' }, { shouldFocus: true })

        const next = { displayName: normaliseProfileText(values.displayName), bio: normaliseProfileText(values.bio) }
        try {
            await updateProfile.mutateAsync(next)
            reset(next)
        } catch {
            // Toasted by the query client; the changes stay to try again.
        }
    })

    const nameField = register('displayName')
    const bioField = register('bio')
    const nameError =
        errors.displayName?.message === 'tooLong'
            ? t('validation.displayNameTooLong')
            : errors.displayName
              ? t('validation.displayNameRequired')
              : undefined

    function saveOnCtrlEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            void save()
        }
    }

    return (
        <form onSubmit={(event) => void save(event)} className='flex flex-1 flex-col' noValidate>
            <div className='grid max-w-[400px] gap-6'>
                <FormField
                    label={t('profile.displayName')}
                    action={<Counter value={displayName} max={DISPLAY_NAME_MAX_LENGTH} />}
                    error={nameError}
                    hint={t('profile.displayNameHint')}
                >
                    {(field) => (
                        <Input
                            autoComplete='nickname'
                            readOnly={isSubmitting}
                            {...field}
                            {...nameField}
                            onChange={limitTo(DISPLAY_NAME_MAX_LENGTH, nameField, (over) =>
                                over ? setError('displayName', { message: 'tooLong' }) : clearErrors('displayName')
                            )}
                        />
                    )}
                </FormField>
                <FormField label={t('profile.username')} hint={t('profile.usernameHint')}>
                    {(field) => <Input readOnly value={profile.username ?? ''} {...field} />}
                </FormField>
                <FormField
                    label={t('profile.bio')}
                    action={<Counter value={bio} max={BIO_MAX_LENGTH} />}
                    error={errors.bio ? t('validation.bioTooLong') : undefined}
                >
                    {(field) => (
                        <Textarea
                            rows={3}
                            placeholder={t('profile.bioPlaceholder')}
                            readOnly={isSubmitting}
                            onKeyDown={saveOnCtrlEnter}
                            {...field}
                            {...bioField}
                            onChange={limitTo(BIO_MAX_LENGTH, bioField, (over) =>
                                over ? setError('bio', { message: 'tooLong' }) : clearErrors('bio')
                            )}
                        />
                    )}
                </FormField>
            </div>
            {isDirty ? <SaveBar saving={isSubmitting} onDiscard={() => reset()} /> : null}
            <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
                <DialogContent className='sm:max-w-dialog'>
                    <DialogHeader>
                        <DialogTitle>{t('discard.title')}</DialogTitle>
                        <DialogDescription>{t('discard.description')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type='button' variant='text' onClick={() => blocker.reset?.()}>
                            {t('discard.stay')}
                        </Button>
                        <Button
                            type='button'
                            variant='destructive'
                            onClick={() => {
                                reset()
                                blocker.proceed?.()
                            }}
                        >
                            {t('discard.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </form>
    )
}
