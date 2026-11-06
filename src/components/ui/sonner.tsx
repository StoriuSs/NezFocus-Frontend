import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * Toast (C-16): inverted like the tooltip so it stands out on every surface,
 * the page's own colours, `rounded.button`, the floating shadow; `body-sm`
 * text; actions in `primary-inverse` 600. Every kind looks the same: an error
 * says what went wrong in words, with its icon in the text colour (`danger`
 * on the inverted background is below 3:1). At most 3 at a time; each hides
 * after 5 seconds, unless hovered or focused. The `x` shows on hover, and on
 * keyboard focus so it can be reached without a mouse.
 *
 * Placed at the bottom right. C-16 puts it at the bottom right of the content
 * area, above the Composer or room controls; that comes with those pages.
 */
function Toaster(props: ToasterProps) {
    const { t } = useTranslation('common')
    return (
        <Sonner
            position='bottom-right'
            offset={24}
            visibleToasts={3}
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
