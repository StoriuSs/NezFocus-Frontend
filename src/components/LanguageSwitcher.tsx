import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Globe } from 'lucide-react'
import US from 'country-flag-icons/react/3x2/US'
import VN from 'country-flag-icons/react/3x2/VN'

const languages = [
    { code: 'en', label: 'English', Flag: US },
    { code: 'vi', label: 'Tiếng Việt', Flag: VN }
] as const

export function LanguageSwitcher() {
    const { i18n } = useTranslation()

    const currentLang = languages.find((lang) => lang.code === i18n.language) || languages[0]

    const changeLanguage = (langCode: string) => {
        void i18n.changeLanguage(langCode)
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='sm' className='gap-2'>
                    <Globe className='h-4 w-4' />
                    <span className='hidden sm:inline-flex items-center gap-2'>
                        <currentLang.Flag className='h-4 w-5' />
                        {currentLang.label}
                    </span>
                    <currentLang.Flag className='h-4 w-5 sm:hidden' />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
                {languages.map((lang) => (
                    <DropdownMenuItem
                        key={lang.code}
                        onClick={() => changeLanguage(lang.code)}
                        className={lang.code === i18n.language ? 'bg-accent' : ''}
                    >
                        <lang.Flag className='h-4 w-5 mr-2' />
                        {lang.label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
