import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShellPage } from '@/components/shell/ShellPage'
import { NoServers, useServers } from '@/features/servers'
import { useProfile } from '@/features/users'

/** Set by the welcome page when the account has just been completed (01 S-ONB-01). */
export interface StudyPageState {
    firstVisit?: boolean
}

/**
 * The Study page, the app's home after sign-in (D-124). Its content (rooms
 * studying now, studying alone, the streak) arrives in M5. Until then, it
 * says when they are in no server yet, and offers to create one (02
 * S-SHELL-01 `no-server`, and `no-server-first` right after the account is
 * completed). M5 moves this into the page's rooms section (08 S-STUDY-01
 * `no-server`).
 */
export default function Study() {
    const { t } = useTranslation()
    const { state } = useLocation() as { state: StudyPageState | null }
    const servers = useServers()
    const profile = useProfile()
    const noServers = servers.isSuccess && servers.data.length === 0

    return (
        <ShellPage title={t('shell.study.title')}>
            {noServers ? (
                <NoServers first={state?.firstVisit === true} name={profile.data?.displayName ?? undefined} />
            ) : null}
        </ShellPage>
    )
}
