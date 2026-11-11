import { create } from 'zustand'

/** Who a handover goes to, when chosen before the dialog opens (the ⋯ menu of S-SET-03). */
export interface TransferRecipient {
    userId: string
    name: string
}

/** Which leave, hand over or delete dialog is open, and on what server. */
export type MembershipDialog =
    /**
     * 03 S-SRV-04: `leave-confirm` for a member; for the owner
     * `owner-cannot-leave`, or `owner-alone` when nobody else is in it.
     */
    | { kind: 'leave'; serverId: string }
    /**
     * 04 S-SET-07: choose who (`transfer-picker`), then the password. With a
     * `recipient` the choice is made already (Q15). `thenLeave`: opened from
     * `owner-cannot-leave`, so `leave-confirm` follows once it is done.
     */
    | { kind: 'transfer'; serverId: string; recipient?: TransferRecipient; thenLeave?: boolean }
    /** 04 S-SET-07 `delete-type-name`. */
    | { kind: 'delete'; serverId: string }

interface MembershipDialogsState {
    open: MembershipDialog | null
    show: (dialog: MembershipDialog) => void
    hide: () => void
}

/**
 * Leaving, handing over and deleting a server (03 S-SRV-04, 04 S-SET-07).
 * Opened from the server menu, the Overview's owner group and the members'
 * ⋯ menu, and drawn by the AppShell, which loads them the first time one opens.
 */
export const useMembershipDialogs = create<MembershipDialogsState>((set) => ({
    open: null,
    show: (dialog) => set({ open: dialog }),
    hide: () => set({ open: null })
}))
