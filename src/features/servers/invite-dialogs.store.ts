import { create } from 'zustand'

interface InviteDialogsState {
    /** "Invite friends" (S-SRV-02) for this server; `created`: right after making it (Q5). */
    invite: { serverId: string; created: boolean } | null
    /** An invite opened while signed in (S-SRV-03 `signed-in`): the code and the link's `?channel=`. */
    join: { code: string; channel: string | null } | null
    showInvite: (serverId: string, created?: boolean) => void
    hideInvite: () => void
    showJoin: (code: string, channel: string | null) => void
    hideJoin: () => void
}

/**
 * The invite dialogs live in the AppShell, so the server menu, a new server
 * and an invite link opened in the app can each open them without owning them.
 */
export const useInviteDialogs = create<InviteDialogsState>((set) => ({
    invite: null,
    join: null,
    showInvite: (serverId, created = false) => set({ invite: { serverId, created } }),
    hideInvite: () => set({ invite: null }),
    showJoin: (code, channel) => set({ join: { code, channel } }),
    hideJoin: () => set({ join: null })
}))
