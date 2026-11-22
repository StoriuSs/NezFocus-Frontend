import { create } from 'zustand'

/** What the Host was doing as asked: leaving, switching rooms (D-50), signing out (D-77). */
export type HostLeaveKind = 'leave' | 'switch' | 'signOut'

/** One "Rời phòng?" asked: the session one is Host of, why, and what goes on once confirmed. */
export interface HostLeaveAsk {
    sessionId: string
    kind: HostLeaveKind
    confirm: () => void
}

interface HostLeaveState {
    asking: HostLeaveAsk | null
    ask: (asking: HostLeaveAsk) => void
    close: () => void
}

/**
 * "Rời phòng?" lives in the AppShell (07 S-ROOM-04 `host-leave-confirm`,
 * D-44, D-50, D-77), so the room's controls, the dock, the preview page's
 * "Chuyển sang phòng này" and Đăng xuất can each ask it without owning it.
 */
export const useHostLeave = create<HostLeaveState>((set) => ({
    asking: null,
    ask: (asking) => set({ asking }),
    close: () => set({ asking: null })
}))
