/**
 * The product's name, in one place.
 *
 * Code, not a setting in /config.js: it is the same in every environment, and
 * it is needed before the app runs (the page title, written into index.html
 * at build time by vite.config.ts).
 */
export const siteConfig = {
    /** The browser tab, the logo, and `{{appName}}` in any translation. */
    name: 'NezFocus'
} as const
