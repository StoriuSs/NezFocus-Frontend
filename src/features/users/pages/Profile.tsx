import { useTranslation } from 'react-i18next'
import { ShellPage } from '@/components/shell/ShellPage'
import { Button } from '@/components/ui/button'
import { useProfile } from '@/features/users/api/useProfile'
import { AvatarSection } from '@/features/users/components/AvatarSection'
import { ProfileForm } from '@/features/users/components/ProfileForm'
import { ProfileSkeleton } from '@/features/users/components/ProfileSkeleton'

/**
 * Your profile (S-ME-02, REQ-AUTH-06), a settings page in the AppShell: the
 * picture, saved on its own, then the display name and bio with a save bar.
 */
export default function Profile() {
    const { t } = useTranslation()
    return (
        <ShellPage title={t('shell.settings.profile')} bodyClassName='flex flex-col'>
            <ProfileContent />
        </ShellPage>
    )
}

function ProfileContent() {
    const { t } = useTranslation()
    // Already loaded at sign-in (the auth store fills this query), so the
    // skeleton and the error are for a profile that could not be read then.
    const { data: profile, error, refetch } = useProfile()

    if (!profile) {
        return error ? (
            <div className='flex flex-col items-start gap-4 p-6 lg:p-8'>
                <p className='text-body-sm text-text-secondary'>{t('users:profile.failedToLoad')}</p>
                <Button variant='outline' size='sm' onClick={() => void refetch()}>
                    {t('buttons.tryAgain')}
                </Button>
            </div>
        ) : (
            <ProfileSkeleton />
        )
    }

    return (
        <div className='flex w-full max-w-[720px] flex-1 flex-col gap-8 p-6 pb-6 lg:p-8 lg:pb-6'>
            <AvatarSection profile={profile} />
            <ProfileForm profile={profile} />
        </div>
    )
}
