import { useTranslation } from 'react-i18next'
import mascotHappy from '@/assets/mascot/runtime-happy-320.webp'
import mascotNeutral from '@/assets/mascot/runtime-neutral-240.webp'
import { Mascot } from '@/components/brand/mascot/Mascot'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useCreateServerDialog } from '../create-server.store'

/** Runtime is in view whenever this page is: load its animation at any width. */
const ALWAYS = '(min-width: 0px)'

/**
 * Not in any server yet (02 S-SHELL-01 `no-server`): Runtime, what a server
 * is for, and "Create a Study Server". Right after the account is completed
 * (`first`), Runtime is happy and waves once, and the title welcomes them
 * (`no-server-first`).
 * "Join with an invite code" opens the same dialog on its second mode (D-82).
 */
export function NoServers({ first = false, name }: { first?: boolean; name?: string }) {
    const { t } = useTranslation()
    const show = useCreateServerDialog((state) => state.show)
    const showJoin = useCreateServerDialog((state) => state.showJoin)

    return (
        <div className='flex min-h-full items-start justify-center px-4 pt-[18vh]'>
            <EmptyState
                mascot={
                    first ? (
                        <Mascot mood='happy' wave size={160} still={mascotHappy} loadWhen={ALWAYS} />
                    ) : (
                        <Mascot mood='neutral' size={120} still={mascotNeutral} loadWhen={ALWAYS} />
                    )
                }
                title={first && name ? t('shell.noServer.firstTitle', { name }) : t('shell.noServer.title')}
                actions={
                    <>
                        <Button onClick={() => show('study')}>{t('shell.noServer.create')}</Button>
                        <Button variant='text' onClick={showJoin}>
                            {t('shell.noServer.joinByCode')}
                        </Button>
                    </>
                }
            >
                {t('shell.noServer.body')}
            </EmptyState>
        </div>
    )
}
