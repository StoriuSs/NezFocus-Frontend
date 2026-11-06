import type { CSSProperties } from 'react'
import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * Toast (C-16): inverted like the tooltip so it stands out on every surface,
 * the page's own colours, `rounded.button`, the floating shadow; `body-sm`
 * text; actions in `primary-inverse` 600. Every kind looks the same: an error
 * says what went wrong in words, with its icon in the text colour (`danger`
 * on the inverted background is below 3:1). At most 3 at a time; each hides
 * after 5 seconds, unless hovered or focused.
 *
 * Placed at the bottom right. C-16 puts it at the bottom right of the content
 * area, above the Composer or room controls; that comes with those pages.
 */
const Toaster = (props: ToasterProps) => (
    <Sonner
        position='bottom-right'
        offset={24}
        visibleToasts={3}
        duration={5000}
        style={
            {
                '--normal-bg': 'rgb(var(--text-primary))',
                '--normal-text': 'rgb(var(--bg))',
                '--normal-border': 'rgb(var(--text-primary))',
                '--border-radius': '12px'
            } as CSSProperties
        }
        toastOptions={{
            classNames: {
                toast: '!font-sans !text-body-sm !shadow-float',
                actionButton: '!bg-transparent !font-semibold !text-primary-inverse'
            }
        }}
        {...props}
    />
)

export { Toaster }
