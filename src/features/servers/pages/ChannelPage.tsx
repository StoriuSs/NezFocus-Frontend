import { Navigate, useParams } from 'react-router-dom'
import { Hash, LampDesk, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PageLoader } from '@/components/PageLoader'
import { ShellPage } from '@/components/shell/ShellPage'
import { EmptyState } from '@/components/ui/empty-state'
import { useServers } from '../api/useServers'
import { firstTextChannel } from '../lib/channel-list'
import { channelPath } from '../lib/paths'

/**
 * A channel of one of their servers. Opening a server without a channel, or a
 * channel they cannot see, lands on its first text channel (02 S-SHELL-01).
 * A server they are not in (any more) leads back to the Study page.
 *
 * M1 has the Header only: messages arrive in M2, voice rooms in M4 (D-144),
 * which until then say so.
 */
export default function ChannelPage() {
    const { t } = useTranslation()
    const { serverId, channelId } = useParams()
    const servers = useServers()

    if (servers.isPending) return <PageLoader className='min-h-0 flex-1' />
    // The page's error boundary offers to try again, only with nothing to
    // show: a failed re-read (back to the tab, after a kick) keeps the last
    // list, so the page stays.
    if (servers.data === undefined) throw servers.error

    const server = servers.data.find((candidate) => candidate.id === serverId)
    if (!server) return <Navigate to='/study' replace />

    const channel = server.channels.find((candidate) => candidate.id === channelId)
    if (!channel) {
        const first = firstTextChannel(server)
        if (first) return <Navigate to={channelPath(server.id, first.id)} replace />
        return <ShellPage title={server.name} />
    }

    if (channel.type === 'voice') {
        return (
            <ShellPage title={channel.name} icon={channel.isStudyRoom ? LampDesk : Volume2}>
                <div className='flex min-h-full items-start justify-center px-4 pt-[18vh]'>
                    <EmptyState title={t('shell.voiceSoon.title')}>{t('shell.voiceSoon.body')}</EmptyState>
                </div>
            </ShellPage>
        )
    }

    return <ShellPage title={channel.name} icon={Hash} />
}
