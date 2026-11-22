import { Suspense } from 'react'
import { useMatch } from 'react-router-dom'
import { InRoomDock, useVoiceStore } from '@/features/voice'
import { useProfile } from '@/features/users'
import { LIST_SHOWS, useMediaQuery } from '@/hooks/useMediaQuery'
import { useServers } from '../api/useServers'
import { channelPath, SERVERS_PATHS } from '../lib/paths'
import { voiceRoomOf } from '../lib/voice-room'

/**
 * The InRoomDock (C-09) while this tab is in a voice room, with the room's
 * name, how many are in it and its study session from the servers held; none on that room's own
 * page (C-09: the page shows it all). `column` at the bottom of the channel
 * list from 1024 up, `strip` across the bottom of the window below; the
 * other draws nothing (not hidden by CSS: a hidden strip would still hold the
 * toasts' edge, C-16, and the sheet of the list below 1024 a second dock).
 */
export function RoomDock({ shape }: { shape: 'column' | 'strip' }) {
    const call = useVoiceStore((state) => state.call)
    const wide = useMediaQuery(LIST_SHOWS)
    // The room's page opened at a message of its chat (a link, the inbox) is its own page too.
    const atChannel = useMatch(SERVERS_PATHS.channel)
    const atMessage = useMatch(SERVERS_PATHS.message)
    const here = (atChannel ?? atMessage)?.params.channelId
    const server = useServers().data?.find((one) => one.id === call?.serverId)
    const channel = server?.channels.find((one) => one.id === call?.channelId)
    const room = server && channel ? voiceRoomOf(server, channel) : undefined
    const me = useProfile().data?.id
    if (!call || call.phase === 'joining' || here === call.channelId || wide !== (shape === 'column')) return null
    return (
        <Suspense fallback={null}>
            <InRoomDock
                shape={shape}
                to={channelPath(call.serverId, call.channelId)}
                room={{
                    serverId: call.serverId,
                    channelId: call.channelId,
                    name: room?.name ?? call.name,
                    // The room gone from the list meanwhile: the dock goes with the link in a moment.
                    canSpeak: room?.canSpeak ?? false,
                    canVideo: room?.canVideo ?? false,
                    modMuted: room?.people.some((one) => one.user.id === me && one.modMuted) ?? false,
                    // Its study session: the dock shows its phase and clock (C-09 `room-session`).
                    session: room?.session ?? null,
                    // Oneself at least, while the list waits for LiveKit's word.
                    count: Math.max(room?.people.length ?? 0, 1)
                }}
            />
        </Suspense>
    )
}
