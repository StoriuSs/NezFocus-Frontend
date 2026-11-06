# Theme

Light, dark, or whatever the operating system is set to — remembered in the
browser, and applied before the page first paints, so a dark-mode user never
sees a white flash.

- [Using it](#using-it)
- [How it works](#how-it-works)
- [Using the theme in a component](#using-the-theme-in-a-component)
- [Remembering it per account](#remembering-it-per-account)

## Using it

There is no theme switcher on screen yet: the theme follows the system until
the Appearance settings page (a later milestone) calls `setTheme()`. The
choices it will offer:

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

## Remembering it per account

Today the choice belongs to the browser. To follow a user across devices,
the API would store it and the app would read it after sign-in. An outline:

1. **The API** — a `theme` field on the user (`light`, `dark` or `system`,
   default `system`), returned in `GET /users/me` and accepted by
   `PATCH /users/me`. In the API starter that is a Prisma field, the
   profile's response and update DTOs, and the users module's handler (its
   `docs/adding-a-module.md` shows the layers). Then `pnpm api:types` here
   ([api-types.md](./api-types.md)).
2. **On load** — keep the `index.html` script exactly as it is: it applies
   the browser's saved choice instantly, before anyone is known.
3. **After sign-in** — when `useProfile()` returns a `theme` that differs from
   the saved one, call `setTheme(profile.theme)`: it saves it locally too, so
   the next load starts right.
4. **When the user changes it** — `setTheme(choice)` as now, plus the
   profile update (`useUpdateProfile`) when signed in.

The local copy stays the source for the first paint; the account's copy wins
once it is known.
