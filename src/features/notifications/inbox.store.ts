import { create } from 'zustand'

interface InboxState {
    /** Whether the inbox (S-NOTI-01) is open beside the rail. */
    open: boolean
    setOpen: (open: boolean) => void
}

/**
 * Whether the inbox is open: the rail's "Thông báo" opens and closes it, and
 * so does the "Xem" of a Toast saying one is no longer in a server (11
 * S-MOD-02 › H1), drawn far from the rail. Each tab keeps its own.
 */
export const useInboxStore = create<InboxState>((set) => ({
    open: false,
    setOpen: (open) => set({ open })
}))

/** Opens the inbox ("Xem" of the Toast of H1). */
export const openInbox = () => useInboxStore.getState().setOpen(true)
