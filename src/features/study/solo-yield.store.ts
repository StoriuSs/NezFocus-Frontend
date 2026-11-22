import { create } from 'zustand'

/**
 * What would end one's Solo (D-103): starting a room's session ("Bắt đầu
 * phiên chung và dừng học một mình?", with the focus minutes the room goes
 * into) or joining a room that has one ("Vào phòng và dừng học một mình?").
 */
export type SoloYieldAsk =
    | { kind: 'start'; focusMinutes: number; confirm: () => void }
    | { kind: 'join'; room: string; confirm: () => void }

interface SoloYieldState {
    asking: SoloYieldAsk | null
    ask: (asking: SoloYieldAsk) => void
    close: () => void
}

/**
 * The question asked before a room's session ends one's Solo (08 S-STUDY-02
 * `start-while-solo-confirm`, `join-room-confirm`), asked from the room's
 * page or its preview, answered by the AppShell's dialog (lazy), as the
 * Host's "Rời phòng?" is.
 */
export const useSoloYield = create<SoloYieldState>((set) => ({
    asking: null,
    ask: (asking) => set({ asking }),
    close: () => set({ asking: null })
}))
