import { create } from 'zustand'

/**
 * Whether a removed avatar is waiting out its "Undo" (avatar-removal.ts).
 * Meanwhile it shows as gone everywhere (useProfile hides it), though the
 * API still has it.
 *
 * On its own because useProfile reads it, and useProfile sits in the first
 * download (the bundler puts it there: the auth store imports this feature's
 * index); the removal itself is the profile page's alone.
 */
export const useAvatarRemoval = create<{ pending: boolean }>(() => ({ pending: false }))
