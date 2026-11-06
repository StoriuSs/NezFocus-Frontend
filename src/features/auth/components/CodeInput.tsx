import { forwardRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

/** How many digits an emailed code has. */
export const CODE_LENGTH = 6

/** The digits of what was typed or pasted: spaces and dashes go, the rest is cut at six. */
export function codeDigits(value: string): string {
    return value.replace(/\D/g, '').slice(0, CODE_LENGTH)
}

export type CodeInputState = 'default' | 'verifying' | 'error' | 'disabled'

interface CodeInputProps {
    value: string
    onChange: (code: string) => void
    /** The sixth digit arrived: S-AUTH-02 sends the code by itself. */
    onComplete?: (code: string) => void
    state?: CodeInputState
    /** For screen readers: "6-digit OTP code". */
    label: string
    describedBy?: string
}

/**
 * Six boxes for an emailed code (C-23). One real input sits on top of them
 * and takes the whole string (`one-time-code`, so the browser can offer the
 * code from the email), the boxes only show it. Pasting a code with spaces or
 * dashes fills all six. After a wrong code (`error`), the first digit typed
 * starts again from an empty row.
 */
export const CodeInput = forwardRef<HTMLInputElement, CodeInputProps>(function CodeInput(
    { value, onChange, onComplete, state = 'default', label, describedBy },
    ref
) {
    const [focused, setFocused] = useState(false)
    const [caret, setCaret] = useState(value.length)
    const readOnly = state === 'verifying'
    const disabled = state === 'disabled'

    function change(next: string) {
        const digits = codeDigits(next)
        onChange(digits)
        setCaret(digits.length)
        if (digits.length === CODE_LENGTH && value.length < CODE_LENGTH) onComplete?.(digits)
    }

    function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        // After a wrong code, typing starts the code again rather than editing the wrong one.
        if (state === 'error' && /^\d$/.test(event.key) && !event.ctrlKey && !event.metaKey) {
            event.preventDefault()
            change(event.key)
        }
    }

    function onPaste(event: ClipboardEvent<HTMLInputElement>) {
        const digits = codeDigits(event.clipboardData.getData('text'))
        if (!digits) return
        event.preventDefault()
        change(digits)
    }

    const active = Math.min(caret, CODE_LENGTH - 1)

    return (
        <div className='relative w-fit'>
            <div className='flex gap-2' aria-hidden='true'>
                {Array.from({ length: CODE_LENGTH }, (_, index) => {
                    const digit = value[index]
                    const isActive = focused && !readOnly && !disabled && index === active
                    return (
                        <div
                            key={index}
                            data-testid='code-box'
                            className={cn(
                                'relative flex h-14 w-12 items-center justify-center rounded-input border font-numeric text-stat tabular-nums transition-colors duration-micro',
                                readOnly
                                    ? 'border-transparent bg-surface-2 text-text-primary'
                                    : disabled
                                      ? 'border-border bg-surface-2 text-text-tertiary'
                                      : 'border-border-input bg-surface-1 text-text-primary',
                                state === 'error' && 'border-danger shadow-[inset_0_0_0_1px_rgb(var(--danger))]',
                                isActive &&
                                    state !== 'error' &&
                                    'border-primary shadow-[inset_0_0_0_1px_rgb(var(--primary))]'
                            )}
                        >
                            {digit}
                            {isActive && !digit ? (
                                <span className='absolute h-7 w-0.5 animate-pulse bg-text-primary' />
                            ) : null}
                        </div>
                    )
                })}
            </div>
            <input
                ref={ref}
                value={value}
                onChange={(event) => change(event.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? value.length)}
                inputMode='numeric'
                autoComplete='one-time-code'
                // Six digits; room for a pasted "482 913" or "482-913" before it is cleaned.
                maxLength={CODE_LENGTH + 1}
                aria-label={label}
                aria-invalid={state === 'error'}
                aria-describedby={describedBy}
                readOnly={readOnly}
                disabled={disabled}
                spellCheck={false}
                className='absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-not-allowed'
            />
        </div>
    )
})
