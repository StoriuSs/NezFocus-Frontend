import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import '@/i18n/deletion'
import { userKeys, type UserSettings } from '@/features/users'
import { useDeleteAccount } from '@/features/auth/api/useDeleteAccount'
import { useAuthStore } from '@/features/auth/auth.store'
import { DELETION_WAIT_MS, deletionDate } from '@/features/auth/lib/deletion-date'
import { blockingServers, serverOwnership, type OwnedServer } from '@/features/auth/lib/server-ownership'
import ConfirmPasswordDialog from './ConfirmPasswordDialog'

/**
 * "Delete account?" (10-settings › S-ME-03 `delete-confirm`, REQ-AUTH-09,
 * D-141): what deleting means and the day the account goes, then the
 * password before anything happens (ConfirmPasswordDialog, with its
 * "Forgot password?"). Nothing is deleted for 14 days: signing in before
 * then restores it. Done, every session ends and this browser lands on sign
 * in, whose banner gives the day again.
 *
 * The servers only they are in go with the account, their invite links
 * stopped at once (D-121): named here. One that gained a member since the
 * check makes the API refuse: this dialog gives way to `delete-blocked-owner`.
 */
export function DeleteAccountDialog({
    email,
    username,
    alone,
    onClose
}: {
    email: string
    username?: string | null
    alone: OwnedServer[]
    onClose: () => void
}) {
    const { t } = useTranslation('deletion')
    const logout = useAuthStore((state) => state.logout)
    // Read only: the AppShell loads the account's settings as the app opens.
    const timeZone = useQuery<UserSettings>({ queryKey: userKeys.settings(), enabled: false }).data?.timezone
    const deleteAccount = useDeleteAccount()
    const queryClient = useQueryClient()
    // When the dialog opened: the day it names is the day the request would set.
    const [deletesOn] = useState(() => deletionDate(new Date(Date.now() + DELETION_WAIT_MS), timeZone))

    return (
        <ConfirmPasswordDialog
            email={email}
            username={username}
            title={t('confirm.title')}
            description={
                <>
                    {t('confirm.description', { date: deletesOn })}
                    {alone.length > 0 ? (
                        <span className='mt-2 block'>
                            <Trans
                                ns='deletion'
                                i18nKey='confirm.alone'
                                count={alone.length}
                                values={{ names: alone.map((server) => server.name).join(', ') }}
                                components={[<strong key='names' className='font-semibold text-text-primary' />]}
                            />
                        </span>
                    ) : null}
                </>
            }
            submitLabel={t('confirm.submit')}
            onConfirm={async (password) => {
                let deletesAt: string
                try {
                    deletesAt = await deleteAccount.mutateAsync(password)
                } catch (error) {
                    const blocking = blockingServers(error)
                    if (!blocking) throw error
                    onClose()
                    serverOwnership().showBlocked(blocking, queryClient)
                    return
                }
                logout('account-deleted', undefined, deletesAt)
            }}
            onClose={onClose}
        />
    )
}
