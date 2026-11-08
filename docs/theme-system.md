# Theme

Light, dark, or whatever the operating system is set to — kept by the
account, so it is the same in every browser, remembered in the browser too,
and applied before the page first paints, so a dark-mode user never sees a
white flash.

- [Using it](#using-it)
- [How it works](#how-it-works)
- [Using the theme in a component](#using-the-theme-in-a-component)
- [It follows the account](#it-follows-the-account)

## Using it

The choice is on Appearance & language (`/settings/appearance`, S-ME-04),
in the order System · Dark · Light:

- **Light** — always light
- **Dark** — always dark
- **System** — follows the operating system's setting, and changes with it
  (the default)

## How it works

| File | What it does |
|------|---------|
| `index.html` | A small inline script that reads the saved theme and adds the `dark` class to `<html>` **before React loads** |
| `src/hooks/useTheme.ts` | The theme store (Zustand) and the `useTheme()` hook |
| `src/index.css` | The design tokens from `DESIGN.md` as CSS variables (`--bg`, `--surface-1..3`, `--text-primary`…), for `:root` (light) and `.dark`; the old shadcn names (`--background`, `--muted`…) point at them |
| `tailwind.config.js` | Turns each token into a class (`bg-surface-2`, `text-text-secondary`, `rounded-button`, `text-body-sm`, `shadow-float`); `darkMode: 'class'`: Tailwind's `dark:` styles apply under `.dark` |

1. The choice is saved in `localStorage` under the key `theme`.
2. On load, the script in `index.html` applies it at once. React renders only
   after the app has started, so without the script a dark-mode user saw a
   white page first. The script and `useTheme.ts` must agree on the key and
   the rules; a comment in each says so.
3. The store reads the same key once, when it is created, and from then on
   `setTheme()` saves the choice and toggles the `dark` class.
4. While the choice is `system`, the hook listens to the
   `prefers-color-scheme` media query and follows it.
5. It is one store for the whole app, so every component sees the same
   theme — the toaster (`src/components/ui/sonner.tsx`) reads the resolved
   one to draw its toasts. (It used to be state inside the hook, so each
   caller had its own copy and the toaster never saw the user's choice.)

## Using the theme in a component

```tsx
import { useTheme } from '@/hooks/useTheme'

function MyComponent() {
    const { theme, setTheme } = useTheme()

    return <button onClick={() => setTheme('dark')}>Current: {theme}</button>
}
```

`theme` is the choice (`light`, `dark` or `system`). For what is actually on
screen, read the store's `resolvedTheme` (`light` or `dark`):
`useThemeStore((state) => state.resolvedTheme)`.

For most styling you need neither: use the token classes (`bg-surface-1`,
`text-text-secondary`), which change with the theme by themselves. New code
uses the token names, not the shadcn aliases. The values come from
`DESIGN.md`: change it first, then `src/index.css` to match; never a value in
`src/index.css` alone.

## It follows the account

The theme is one of the account's settings (`theme` in
`GET` / `PATCH /users/me/settings`, default `system`), so a choice made in one
browser shows in the others (REQ-AUTH-08, D-37):

1. **On load** — the `index.html` script applies the browser's saved choice
   at once, before anyone is known.
2. **Once signed in** — `useAccountSettings()`
   (`src/features/users/hooks/useAccountSettings.ts`), mounted once by the
   AppShell, reads the settings (`useSettings()`) and calls
   `setTheme(settings.theme)`. That saves it locally too, so the next load
   starts right.
3. **When the user changes it** — the Appearance page saves it
   (`useUpdateSettings`). The change is optimistic: the cached settings change
   at once, so the hook above applies it before the API answers; a failed
   save puts the old one back, with a toast.
4. **In the other tabs** — a saved change is sent on a `BroadcastChannel`
   named `settings` (`src/features/users/lib/settings-sync.ts`); the hook
   puts it in each tab's cache, and the theme follows.

The local copy stays the source for the first paint; the account's copy wins
once it is known. The pages outside the app (sign-in, the legal pages) use the
local copy only. The language follows the account the same way
([i18n.md](./i18n.md#the-language-switch)).
