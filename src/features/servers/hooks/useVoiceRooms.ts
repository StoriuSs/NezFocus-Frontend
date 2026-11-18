import { useMemo } from 'react'
import { useVoiceSession } from '@/features/voice'
import { useServers } from '../api/useServers'
import { voiceDirectory } from '../lib/voice-room'

/**
 * Voice's tab-wide work (`useVoiceSession`: joining again after a reload,
 * the Toast when moved to another room elsewhere, saying one's state again,
 * D-206) over the rooms of the servers held. Run once by the AppShell.
 */
export function useVoiceRooms(): void {
    const servers = useServers().data
    const directory = useMemo(() => (servers ? voiceDirectory(servers) : undefined), [servers])
    useVoiceSession(directory)
}
