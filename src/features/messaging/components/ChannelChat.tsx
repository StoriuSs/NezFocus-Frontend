import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { settingsCache, useProfile } from '@/features/users'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { useChannelMessages } from '../api/useChannelMessages'
import { useSendMessage } from '../api/useSendMessage'
import { useBrowserOnline } from '../hooks/useBrowserOnline'
import { authorFrom, chatMessages } from '../lib/chat-messages'
import { chatRows } from '../lib/chat-rows'
import { Composer } from './Composer'
import { MessageList } from './MessageList'

/**
 * A text channel's chat (S-CHAT-01): the messages, the typing line's place
 * (24 high, kept empty so the list never jumps; C-10), and the composer.
 * Mounted once per channel (`key`), so scrolling starts afresh in each.
 */
export default function ChannelChat({ channelId, channelName }: { channelId: string; channelName: string }) {
    const profile = useProfile().data
    const timeZone = useQuery(settingsCache).data?.timezone
    const now = useMinuteClock()
    const online = useBrowserOnline()
    const history = useChannelMessages(channelId)
    const author = useMemo(() => authorFrom(profile), [profile])
    const { send, retry, discard } = useSendMessage(channelId, author)

    const pages = history.data?.pages
    const rows = useMemo(() => chatRows(chatMessages(pages), timeZone), [pages, timeZone])

    const { hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage, refetch } = history
    const older = useMemo(
        () => ({ has: hasPreviousPage, loading: isFetchingPreviousPage, load: () => void fetchPreviousPage() }),
        [hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage]
    )

    return (
        <>
            <MessageList
                channelName={channelName}
                rows={rows}
                status={pages ? 'ready' : history.isError ? 'error' : 'loading'}
                older={older}
                onReload={() => void refetch()}
                now={now}
                timeZone={timeZone}
                online={online}
                onRetry={retry}
                onDiscard={discard}
            />
            <div className='h-6 shrink-0' aria-hidden='true' />
            <Composer userId={author?.id} channelId={channelId} channelName={channelName} onSend={send} />
        </>
    )
}
