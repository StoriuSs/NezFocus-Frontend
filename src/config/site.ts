/**
 * The product: its name and where its links go. The one place to change when
 * the starter becomes your app (docs/making-it-yours.md).
 *
 * Code, not a setting in /config.js: it is the same in every environment, and
 * it is needed before the app runs (the page title, written into index.html
 * at build time by vite.config.ts).
 */
export const siteConfig = {
    /** The full name: the browser tab, and `{{appName}}` in any translation. */
    name: 'ReactStarter',
    /**
     * Where there is little room: the header, next to the logo. The same as
     * `name` here; give it its own value when the full name is too long
     * (as a web manifest's `name` and `short_name`).
     */
    shortName: 'ReactStarter',
    links: {
        /** The home page's Documentation button. */
        docs: 'https://github.com/StoriuSs/React-Starter-No-Keycloak/tree/main/docs'
    }
} as const
