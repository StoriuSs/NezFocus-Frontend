import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import '@/i18n/deletion'
import { Button } from '@/components/ui/button'
import { SettingsGroup } from '@/components/settings/SettingsRow'
import { getApiErrorMessage } from '@/lib/api-error'
import { serverOwnership, type OwnedServer } from '@/features/auth/lib/server-ownership'
import { DeleteAccountDialog } from './DeleteAccountDialog'

/**
 * "Delete account" on the account page (10-settings › S-ME-03): what it
 * means, and the button. It looks at the servers one owns first: any with
 * other members are handed over before any password (`delete-blocked-owner`,
 * the servers feature's dialog); otherwise the dialog opens, mounted while
 * open so it opens empty every time, naming the servers only they are in.
 */
export function DeleteAccountSection({ email, username }: { email: string; username?: string | null }) {
    const { t } = useTranslation('deletion')
    const queryClient = useQueryClient()
    const [checking, setChecking] = useState(false)
    const [alone, setAlone] = useState<OwnedServer[] | null>(null)
    // The check outlives the page when one leaves it meanwhile: its answer is dropped then.
    const mounted = useRef(true)
    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])

    async function start() {
        if (checking) return
        setChecking(true)
        try {
            const ownership = serverOwnership()
            const owned = await ownership.owned(queryClient)
            if (!mounted.current) return
            if (owned.blocking.length > 0) ownership.showBlocked(owned.blocking, queryClient)
            else setAlone(owned.alone)
        } catch (error) {
            if (mounted.current) toast.error(getApiErrorMessage(error))
        } finally {
            if (mounted.current) setChecking(false)
        }
    }

    return (
        <SettingsGroup id='delete-account' title={t('section.title')}>
            <p className='max-w-[448px] py-2 text-body-sm text-text-secondary'>{t('section.description')}</p>
            {/* aria-disabled, not disabled: the focus stays on it, and the dialogs give it back here. */}
            <Button variant='destructive' size='sm' aria-disabled={checking} onClick={() => void start()}>
                {checking ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                {t('section.open')}
            </Button>
            {alone ? (
                <DeleteAccountDialog email={email} username={username} alone={alone} onClose={() => setAlone(null)} />
            ) : null}
        </SettingsGroup>
    )
}
