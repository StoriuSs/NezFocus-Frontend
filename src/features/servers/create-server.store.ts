import { create } from 'zustand'
import type { ServerTemplate } from './types'

interface CreateServerDialogState {
    open: boolean
    /** The template chosen when it opens: Study Server unless told otherwise. */
    template: ServerTemplate
    show: (template?: ServerTemplate) => void
    hide: () => void
}

/**
 * Whether "Create a server" (S-SRV-01) is open. It opens from the rail's ＋
 * and from the no-server page, and lives in the AppShell, so either can open
 * it without owning it.
 */
export const useCreateServerDialog = create<CreateServerDialogState>((set) => ({
    open: false,
    template: 'study',
    show: (template = 'study') => set({ open: true, template }),
    hide: () => set({ open: false })
}))
