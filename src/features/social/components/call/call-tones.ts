import type { CSSProperties } from 'react'

/**
 * The two semantic buttons of a call (09 › Màu): Kết thúc / Hủy / Từ chối
 * `danger`, Nghe `success`, the icon in `bg`. Their colour inline, so it
 * holds over the round control's own hover (`surface-3`) without a class
 * in the social stylesheet; a hover shades it with the pressed overlay
 * (`PRESSED`, a class of the main stylesheet).
 */
export const DANGER: CSSProperties = {
    backgroundColor: 'rgb(var(--danger))',
    borderColor: 'rgb(var(--danger))',
    color: 'rgb(var(--bg))'
}
export const SUCCESS: CSSProperties = {
    backgroundColor: 'rgb(var(--success))',
    borderColor: 'rgb(var(--success))',
    color: 'rgb(var(--bg))'
}
export const PRESSED = 'hover:bg-[linear-gradient(var(--overlay-pressed),var(--overlay-pressed))]'
