/**
 * Tailwind reads the design tokens of DESIGN.md from the CSS variables in
 * src/index.css. Class names keep DESIGN.md's token names, so a class can be
 * checked against the spec by eye: `bg-surface-2`, `text-text-secondary`,
 * `rounded-button`, `text-body-sm`, `shadow-float`.
 *
 * Spacing keeps Tailwind's 4 px scale; DESIGN.md's steps are on it:
 * space-1 = 1, space-2 = 2, space-3 = 4, space-4 = 6, space-5 = 8,
 * space-6 = 12, space-7 = 16.
 * Breakpoints keep Tailwind's: md 768, lg 1024, xl 1280 (DESIGN.md › Layout).
 */

/** A colour token stored as "r g b", so `/50` opacity modifiers work. */
const rgb = (name) => `rgb(var(--${name}) / <alpha-value>)`

/** Token names, copied from DESIGN.md (front matter `colors`). */
const TOKENS = [
    'bg',
    'surface-1',
    'surface-2',
    'surface-3',
    'text-primary',
    'text-secondary',
    'text-tertiary',
    'on-primary',
    'primary-inverse',
    'border-input',
    'phase-focus',
    'phase-focus-room',
    'phase-short',
    'phase-short-room',
    'phase-long',
    'phase-long-room',
    'success',
    'warning',
    'danger',
    'brand-primary',
    'brand-navy'
]

/** [size, { lineHeight, fontWeight }] from DESIGN.md (front matter `typography`). */
const type = (size, lineHeight, fontWeight) => [`${size}px`, { lineHeight: `${lineHeight}px`, fontWeight }]

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    // The chat's own classes go in its own stylesheet (tailwind.messaging.config.js),
    // loaded with its chunk, not in the one loaded before the first screen.
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', '!./src/features/messaging/**'],
    theme: {
        container: {
            center: true,
            padding: '2rem',
            screens: {
                '2xl': '1400px'
            }
        },
        extend: {
            colors: {
                ...Object.fromEntries(TOKENS.map((name) => [name, rgb(name)])),
                primary: {
                    DEFAULT: rgb('primary'),
                    foreground: rgb('on-primary')
                },
                border: rgb('border'),
                'overlay-pressed': 'var(--overlay-pressed)',
                scrim: 'var(--scrim)',
                // The shadcn/ui names the base components use (src/index.css).
                background: rgb('background'),
                foreground: rgb('foreground'),
                card: { DEFAULT: rgb('card'), foreground: rgb('card-foreground') },
                popover: { DEFAULT: rgb('popover'), foreground: rgb('popover-foreground') },
                secondary: { DEFAULT: rgb('secondary'), foreground: rgb('secondary-foreground') },
                muted: { DEFAULT: rgb('muted'), foreground: rgb('muted-foreground') },
                accent: { DEFAULT: rgb('accent'), foreground: rgb('accent-foreground') },
                destructive: { DEFAULT: rgb('destructive'), foreground: rgb('destructive-foreground') },
                input: rgb('input'),
                ring: rgb('ring')
            },
            fontFamily: {
                sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
                numeric: ['Unbounded', '"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
                mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
            },
            fontSize: {
                hero: type(56, 64, '800'),
                display: type(34, 44, '800'),
                'title-1': type(26, 36, '700'),
                'title-2': type(20, 28, '600'),
                headline: type(17, 24, '600'),
                body: type(16, 24, '400'),
                'body-sm': type(14, 20, '400'),
                label: type(13, 20, '500'),
                micro: type(11, 14, '600'),
                timer: type(76, 88, '500'),
                'timer-long': type(60, 69, '500'),
                stat: type(32, 40, '600'),
                'numeric-inline': type(16, 24, '500'),
                'mono-code': type(14, 22, '400')
            },
            borderRadius: {
                badge: '4px',
                input: '8px',
                button: '12px',
                server: '16px',
                sheet: '24px',
                // The base components' names.
                lg: '12px',
                md: '8px',
                sm: '4px'
            },
            boxShadow: {
                // Floating layers only (DESIGN.md › Elevation & Depth).
                float: '0 4px 16px var(--shadow)',
                'sheet-left': '4px 0 24px var(--shadow)',
                'sheet-right': '-4px 0 24px var(--shadow)',
                sheet: '0 -4px 24px var(--shadow)'
            },
            transitionDuration: {
                micro: '120ms',
                short: '200ms',
                medium: '320ms'
            },
            // DESIGN.md › Layout: the rail and the right panel's widths
            // (`w-rail`, `left-rail`, `w-panel`).
            spacing: {
                rail: '72px',
                panel: '280px'
            },
            maxWidth: {
                // DESIGN.md › Layout, reading width of the settings pages.
                settings: '720px',
                // The dialogs' width in the frames (S-ME-02, S-ME-03, S-AUTH-03).
                dialog: '440px'
            }
        }
    },
    plugins: []
}
