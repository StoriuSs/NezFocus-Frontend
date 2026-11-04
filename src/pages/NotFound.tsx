import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { FileQuestion } from 'lucide-react'

export default function NotFound() {
    const { t } = useTranslation('pages')

    return (
        <div className='flex min-h-screen flex-col items-center justify-center bg-background text-foreground gap-4'>
            <FileQuestion className='h-24 w-24 text-muted-foreground opacity-50' />
            <h1 className='text-4xl font-bold'>{t('notFound.title')}</h1>
            <p className='text-muted-foreground text-lg'>{t('notFound.description')}</p>
            <Button asChild size='lg' className='mt-4'>
                <Link to='/'>{t('notFound.goHome')}</Link>
            </Button>
        </div>
    )
}
