import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import '@/i18n/deletion'
import { userKeys, type UserSettings } from '@/features/users'
import { useDeleteAccount } from '@/features/auth/api/useDeleteAccount'
import { useAuthStore } from '@/features/auth/auth.store'
import { DELETION_WAIT_MS, deletionDate } from '@/features/auth/lib/deletion-date'
import ConfirmPasswordDialog from './ConfirmPasswordDialog'

/**
 * "Delete account?" (10-settings › S-ME-03 `delete-confirm`, REQ-AUTH-09,
 * D-141): what deleting means and the day the account goes, then the
 * password before anything happens (ConfirmPasswordDialog, with its
 * "Forgot password?"). Nothing is deleted for 14 days: signing in before
 * then restores it. Done, every session ends and this browser lands on sign
 * in, whose banner gives the day again.
 */
export function DeleteAccountDialog({
    email,
    username,
    onClose
}: {
    email: string
    username?: string | null
    onClose: () => void
}) {
    const { t } = useTranslation('deletion')
    const logout = useAuthStore((state) => state.logout)
    // Read only: the AppShell loads the account's settings as the app opens.
    const timeZone = useQuery<UserSettings>({ queryKey: userKeys.settings(), enabled: false }).data?.timezone
    const deleteAccount = useDeleteAccount()
    // When the dialog opened: the day it names is the day the request would set.
    const [deletesOn] = useState(() => deletionDate(new Date(Date.now() + DELETION_WAIT_MS), timeZone))

    return (
        <ConfirmPasswordDialog
            email={email}
            username={username}
            title={t('confirm.title')}
            description={t('confirm.description', { date: deletesOn })}
            submitLabel={t('confirm.submit')}
            onConfirm={async (password) => {
                const deletesAt = await deleteAccount.mutateAsync(password)
                logout('account-deleted', undefined, deletesAt)
            }}
            onClose={onClose}
        />
    )
}
