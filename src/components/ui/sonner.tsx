import { useEffect, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Toaster as Sonner, toast, useSonner } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { toastPlace, useToastArea } from '@/hooks/useToastArea'

type ToasterProps = React.ComponentProps<typeof Sonner>

/** At most this many at a time (C-16 › Hàng đợi). */
const SHOWN = 3

/**
 * Toast (C-16): inverted like the tooltip so it stands out on every surface,
 * the page's own colours, `rounded.button`, the floating shadow; `body-sm`
 * text; actions in `primary-inverse` 600. Every kind looks the same: an error
 * says what went wrong in words, with its icon in the text colour (`danger`
 * on the inverted background is below 3:1). At most 3 at a time; each hides
 * after 5 seconds, unless hovered or focused. The `x` shows on hover, and on
 * keyboard focus so it can be reached without a mouse. A fourth pushes the
 * oldest out: it goes, as if closed, so whatever waits on it (a task row
 * standing still for its "Hoàn tác") moves on at once. Sonner on its own
 * only hides it behind the three and lets its time run.
 *
 * Placed at the bottom right of the content area, above the Composer (or 24
 * from the window's corner on a page with none); in the middle at the bottom
 * below 1024 (`useToastArea`). Not yet: the pages outside the app (C-16: the
 * form column's right, above the language line) still use the window's corner.
 */
function Toaster(props: ToasterProps) {
    const { t } = useTranslation('common')
    const edges = useToastArea(useShallow((state) => state))
    const wide = useMediaQuery('(min-width: 1024px)')
    const { position, offset } = toastPlace(edges, { width: window.innerWidth, height: window.innerHeight }, wide)
    // Newest first (Sonner's order): everything past the third is pushed out.
    const { toasts } = useSonner()
    useEffect(() => {
        for (const old of toasts.slice(SHOWN)) toast.dismiss(old.id)
    }, [toasts])
    return (
        <Sonner
            position={position}
            offset={offset}
            mobileOffset={offset}
            visibleToasts={SHOWN}
            duration={5000}
            closeButton
            style={
                {
                    '--normal-bg': 'rgb(var(--text-primary))',
                    '--normal-text': 'rgb(var(--bg))',
                    '--normal-border': 'rgb(var(--text-primary))',
                    '--border-radius': '12px'
                } as CSSProperties
            }
            toastOptions={{
                closeButtonAriaLabel: t('closeToast'),
                // The x at the top right. Sonner puts it top left unless the page is
                // right-to-left; its position comes from these variables, set on the
                // toaster and inherited, so each toast overrides them. `auto`, not
                // `unset`: on a custom property `unset` means inherit, which brings
                // back the toaster's 0 and pins the x to the left again.
                style: {
                    '--toast-close-button-start': 'auto',
                    '--toast-close-button-end': '0',
                    '--toast-close-button-transform': 'translate(35%, -35%)'
                } as CSSProperties,
                classNames: {
                    toast: 'group !font-sans !text-body-sm !shadow-float',
                    actionButton: '!bg-transparent !font-semibold !text-primary-inverse',
                    // `bg` like the text: Sonner's own x colour is dark, lost on the dark inverted toast of the light theme.
                    closeButton: '!text-bg opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                }
            }}
            {...props}
        />
    )
}

export { Toaster }
