import Appearance from './Appearance'
import Notifications from './Notifications'
import Privacy from './Privacy'

const PAGES = { appearance: Appearance, notifications: Notifications, privacy: Privacy }

export type PreferencesPage = keyof typeof PAGES

/**
 * Appearance & language, Notifications and Privacy (S-ME-04 → S-ME-06) in
 * one chunk: three small pages on the same settings and words. One lazy
 * import for the three keeps the first download smaller than three would
 * (each lazy route costs its loader there, code-splitting.md).
 */
export default function Preferences({ page }: { page: PreferencesPage }) {
    const Page = PAGES[page]
    return <Page />
}
