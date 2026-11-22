import { useTranslation } from 'react-i18next'
import mascotHappy from '@/assets/mascot/runtime-happy-320.webp'
import { Mascot } from '@/components/brand/mascot/Mascot'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useCreateServerDialog } from '../create-server.store'

/** Runtime is in view whenever this page is: load its animation at any width. */
const ALWAYS = '(min-width: 0px)'

/**
 * The welcome right after the account is completed, in no server yet (02
 * S-SHELL-01 `no-server-first`, D-124): Runtime happy, waving once, "Chào
 * mừng An đến với NezFocus", what a server is for, "Create a Study Server"
 * and "Join with an invite code" (the same dialog on its second mode, D-82).
 * In no server at any other time, the Study page says so in its rooms' part
 * (08 S-STUDY-01 `no-server`, `LiveRooms`).
 */
export function NoServers({ name }: { name?: string }) {
    const { t } = useTranslation()
    const show = useCreateServerDialog((state) => state.show)
    const showJoin = useCreateServerDialog((state) => state.showJoin)

    return (
        <div className='flex min-h-full items-start justify-center px-4 pt-[18vh]'>
            <EmptyState
                mascot={<Mascot mood='happy' wave size={160} still={mascotHappy} loadWhen={ALWAYS} />}
                title={name ? t('shell.noServer.firstTitle', { name }) : t('shell.noServer.title')}
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
