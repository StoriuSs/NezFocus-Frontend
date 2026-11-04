import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AUTH_PATHS, useAuthStore } from '@/features/auth'
import { USERS_PATHS } from '@/features/users'
import { Button } from '@/components/ui/button'
import { ShieldCheck, Zap, Database } from 'lucide-react'
import { siteConfig } from '@/config/site'

export default function Home() {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const { t } = useTranslation(['pages', 'common'])

    return (
        <div className='flex min-h-screen flex-col bg-background'>
            <main className='flex-1'>
                <section className='space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-32'>
                    <div className='container flex max-w-[64rem] flex-col items-center gap-4 text-center'>
                        <h1 className='font-heading text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground'>
                            {t('home.hero.title')} <br />
                            {t('home.hero.subtitle')}
                        </h1>
                        <p className='max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8'>
                            {t('home.hero.description')}
                        </p>
                        <div className='space-x-4'>
                            <Button asChild size='lg'>
                                <Link to={isAuthenticated ? USERS_PATHS.profile : AUTH_PATHS.signUp}>
                                    {t('common:buttons.getStarted')}
                                </Link>
                            </Button>
                            <Button asChild variant='outline' size='lg'>
                                <a href={siteConfig.links.docs} target='_blank' rel='noreferrer'>
                                    {t('common:buttons.documentation')}
                                </a>
                            </Button>
                        </div>
                    </div>
                </section>

                <section className='container space-y-6 bg-slate-50 py-8 dark:bg-transparent md:py-12 lg:py-24'>
                    <div className='mx-auto grid justify-center gap-4 sm:grid-cols-2 md:max-w-[64rem] md:grid-cols-3'>
                        <div className='relative overflow-hidden rounded-lg border bg-background p-2'>
                            <div className='flex h-[180px] flex-col justify-between rounded-md p-6'>
                                <ShieldCheck className='h-12 w-12 text-primary' />
                                <div className='space-y-2'>
                                    <h3 className='font-bold'>{t('home.features.security.title')}</h3>
                                    <p className='text-sm text-muted-foreground'>
                                        {t('home.features.security.description')}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className='relative overflow-hidden rounded-lg border bg-background p-2'>
                            <div className='flex h-[180px] flex-col justify-between rounded-md p-6'>
                                <Database className='h-12 w-12 text-primary' />
                                <div className='space-y-2'>
                                    <h3 className='font-bold'>{t('home.features.serverState.title')}</h3>
                                    <p className='text-sm text-muted-foreground'>
                                        {t('home.features.serverState.description')}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className='relative overflow-hidden rounded-lg border bg-background p-2'>
                            <div className='flex h-[180px] flex-col justify-between rounded-md p-6'>
                                <Zap className='h-12 w-12 text-primary' />
                                <div className='space-y-2'>
                                    <h3 className='font-bold'>{t('home.features.fastTyped.title')}</h3>
                                    <p className='text-sm text-muted-foreground'>
                                        {t('home.features.fastTyped.description')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    )
}
