import { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'

/**
 * A password field with a button to show what was typed. Long passwords are
 * what the rules ask for, and typing one blind is where typos come from.
 */
export const PasswordInput = forwardRef<HTMLInputElement, React.ComponentProps<'input'>>((props, ref) => {
    const [visible, setVisible] = useState(false)
    const { t } = useTranslation('auth')

    return (
        <div className='relative'>
            <Input {...props} ref={ref} type={visible ? 'text' : 'password'} className='pr-10' />
            <button
                type='button'
                onClick={() => setVisible((shown) => !shown)}
                className='absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md'
                aria-label={visible ? t('fields.hidePassword') : t('fields.showPassword')}
                aria-pressed={visible}
            >
                {visible ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
            </button>
        </div>
    )
})
PasswordInput.displayName = 'PasswordInput'
