import { useState } from 'react'
import { Loader2, User, CheckCircle, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useAuthStore } from '@/features/auth'
import { useSetUsername } from '@/features/users/api/useSetUsername'
import { USERNAME_MAX_LENGTH, useUsernameAvailability } from '@/features/users/api/useUsernameAvailability'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface UsernamePromptModalProps {
    open: boolean
}

export function UsernamePromptModal({ open }: UsernamePromptModalProps) {
    const { t } = useTranslation('users')
    const [username, setUsername] = useState('')
    const logout = useAuthStore((state) => state.logout)

    // Closes when the refreshed profile reports a username (see the wrapper).
    const setUsernameMutation = useSetUsername()
    const { isValid, isChecking, isAvailable, checkFailed, retryCheck } = useUsernameAvailability(username)

    // Submittable only when the name on screen is the name that was checked.
    const canSubmit = isValid && isAvailable === true && !setUsernameMutation.isPending

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (canSubmit) {
            setUsernameMutation.mutate(username)
        }
    }

    return (
        // Required step: the dialog cannot be dismissed until a username is set.
        <Dialog open={open} onOpenChange={() => {}}>
            <DialogContent
                className='sm:max-w-[425px]'
                hideCloseButton
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <div className='mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10'>
                        <User className='h-6 w-6 text-primary' />
                    </div>
                    <DialogTitle className='text-center'>{t('usernamePrompt.title')}</DialogTitle>
                    <DialogDescription className='text-center'>{t('usernamePrompt.description')}</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className='space-y-4 py-4'>
                    <div className='space-y-2'>
                        <Label htmlFor='username'>{t('usernamePrompt.label')}</Label>
                        <div className='relative'>
                            <Input
                                id='username'
                                value={username}
                                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                                placeholder={t('usernamePrompt.placeholder')}
                                className='pr-10'
                                maxLength={USERNAME_MAX_LENGTH}
                                autoComplete='off'
                            />
                            <div className='absolute right-3 top-1/2 -translate-y-1/2'>
                                {isChecking && <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />}
                                {!isChecking && isAvailable === true && (
                                    <CheckCircle className='h-4 w-4 text-green-500' />
                                )}
                                {!isChecking && isAvailable === false && (
                                    <XCircle className='h-4 w-4 text-destructive' />
                                )}
                            </div>
                        </div>
                        <p className='text-xs text-muted-foreground'>{t('usernamePrompt.hint')}</p>
                        {isAvailable === false && (
                            <p className='text-xs text-destructive'>{t('usernamePrompt.taken')}</p>
                        )}
                        {checkFailed && (
                            <p className='text-xs text-destructive' role='alert'>
                                {t('usernamePrompt.checkFailed')}{' '}
                                <button type='button' className='underline' onClick={retryCheck}>
                                    {t('usernamePrompt.retryCheck')}
                                </button>
                            </p>
                        )}
                    </div>

                    <Button type='submit' className='w-full' disabled={!canSubmit}>
                        {setUsernameMutation.isPending ? (
                            <>
                                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                                {t('usernamePrompt.setting')}
                            </>
                        ) : (
                            t('usernamePrompt.confirm')
                        )}
                    </Button>

                    {/* The dialog can't be dismissed, so it must not trap someone
                        signed in to the wrong account. */}
                    <p className='text-center text-xs text-muted-foreground'>
                        {t('usernamePrompt.notYou')}{' '}
                        <button type='button' className='underline hover:text-foreground' onClick={() => logout()}>
                            {t('usernamePrompt.signOut')}
                        </button>
                    </p>
                </form>
            </DialogContent>
        </Dialog>
    )
}
