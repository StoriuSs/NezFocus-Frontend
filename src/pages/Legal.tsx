import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Languages, Moon, Sun } from 'lucide-react'
import { LogoLockup } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useTheme, useThemeStore } from '@/hooks/useTheme'
import { parseMarkdown, type Inline } from '@/lib/simple-markdown'
import { AUTH_PATHS, useAuthStore } from '@/features/auth'
import termsVi from './legal/content/vi/terms.md?raw'
import termsEn from './legal/content/en/terms.md?raw'
import privacyVi from './legal/content/vi/privacy.md?raw'
import privacyEn from './legal/content/en/privacy.md?raw'

/** The two texts, in both languages (docs/legal is the source of the Vietnamese). */
const TEXTS = {
    terms: { vi: termsVi, en: termsEn },
    privacy: { vi: privacyVi, en: privacyEn }
} as const

export type LegalDocument = keyof typeof TEXTS

const CONTACT = 'mailto:hieupt1003@gmail.com'

function InlineText({ content }: { content: Inline[] }) {
    return (
        <>
            {content.map((part, index) =>
                part.type === 'bold' ? (
                    <strong key={index} className='font-semibold text-text-primary'>
                        {part.text}
                    </strong>
                ) : part.type === 'link' ? (
                    <a key={index} href={part.href} className='text-primary underline'>
                        {part.text}
                    </a>
                ) : (
                    <span key={index}>{part.text}</span>
                )
            )}
        </>
    )
}

/**
 * The bar over the public pages (12 › Thanh trên): the logo, then switching
 * language and theme and the way in for a visitor; for someone signed in,
 * only "Open NezFocus", since language and theme follow the account.
 */
function TopBar() {
    const { t, i18n } = useTranslation('pages')
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const { setTheme } = useTheme()
    const resolvedTheme = useThemeStore((state) => state.resolvedTheme)
    const other = i18n.resolvedLanguage === 'vi' ? 'en' : 'vi'

    return (
        <header className='sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b bg-bg px-4 md:h-16 md:px-8 xl:px-[120px]'>
            <Link to='/' className='inline-flex rounded-input transition-opacity duration-micro hover:opacity-80'>
                <LogoLockup />
            </Link>
            {isAuthenticated ? (
                <Button asChild variant='outline' size='sm'>
                    <Link to='/study'>{t('legal.open')}</Link>
                </Button>
            ) : (
                <div className='flex items-center gap-1'>
                    <Button
                        variant='text'
                        size='sm'
                        className='text-text-secondary'
                        aria-label={t('legal.switchLanguage')}
                        title={t('legal.switchLanguage')}
                        onClick={() => void i18n.changeLanguage(other)}
                    >
                        <Languages aria-hidden='true' />
                        {other.toUpperCase()}
                    </Button>
                    <Button
                        variant='ghost'
                        size='icon'
                        aria-label={resolvedTheme === 'dark' ? t('legal.lightTheme') : t('legal.darkTheme')}
                        title={resolvedTheme === 'dark' ? t('legal.lightTheme') : t('legal.darkTheme')}
                        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                    >
                        {resolvedTheme === 'dark' ? <Sun aria-hidden='true' /> : <Moon aria-hidden='true' />}
                    </Button>
                    <Button asChild variant='text' className='hidden min-[360px]:inline-flex'>
                        <Link to={AUTH_PATHS.signIn}>{t('legal.signIn')}</Link>
                    </Button>
                    <Button asChild size='sm' className='hidden md:inline-flex'>
                        <Link to={AUTH_PATHS.register}>{t('legal.register')}</Link>
                    </Button>
                </div>
            )}
        </header>
    )
}

function Footer() {
    const { t } = useTranslation('pages')
    const link = (to: string, children: ReactNode) => (
        <Button asChild variant='text' size='sm'>
            {to.startsWith('mailto:') ? <a href={to}>{children}</a> : <Link to={to}>{children}</Link>}
        </Button>
    )
    return (
        <footer
            aria-label={t('legal.footer')}
            className='flex flex-col gap-4 border-t bg-bg px-4 py-8 md:flex-row md:items-start md:justify-between md:px-8 md:py-12 xl:px-[120px]'
        >
            <div className='space-y-2'>
                <LogoLockup />
                <p className='text-body-sm text-text-secondary'>{t('legal.byline')}</p>
            </div>
            <nav className='-mx-3 flex flex-wrap'>
                {link('/terms', t('legal.footerTerms'))}
                {link('/privacy', t('legal.footerPrivacy'))}
                {link(CONTACT, t('legal.contact'))}
            </nav>
        </footer>
    )
}

/**
 * The Terms of Service and the Privacy Policy (S-PUB-02, D-127): one column
 * of text, in the language on screen. "Complete your account" links here in
 * a new tab, so the page has no "Back".
 */
export default function Legal({ document }: { document: LegalDocument }) {
    const { t, i18n } = useTranslation('pages')
    const language = i18n.resolvedLanguage === 'vi' ? 'vi' : 'en'
    const blocks = useMemo(() => parseMarkdown(TEXTS[document][language]), [document, language])
    useDocumentTitle(t(`legal.${document}`))

    return (
        <div className='flex min-h-dvh flex-col bg-bg'>
            <TopBar />
            <main className='mx-auto w-full max-w-[752px] flex-1 px-4 pb-16 pt-10 md:px-8 md:pt-16'>
                <article className='space-y-4 text-body text-text-secondary'>
                    {blocks.map((block, index) => {
                        switch (block.type) {
                            case 'title':
                                return (
                                    <h1 key={index} className='text-title-2 text-text-primary md:text-title-1'>
                                        {block.text}
                                    </h1>
                                )
                            case 'meta':
                                return (
                                    <p key={index} className='!mt-1 text-label text-text-tertiary'>
                                        {block.text}
                                    </p>
                                )
                            case 'heading':
                                return (
                                    <h2
                                        key={index}
                                        id={block.id}
                                        className='!mt-10 scroll-mt-20 text-title-2 text-text-primary'
                                    >
                                        {block.text}
                                    </h2>
                                )
                            case 'list':
                                return (
                                    <ul key={index} className='list-disc space-y-1 pl-6'>
                                        {block.items.map((item, itemIndex) => (
                                            <li key={itemIndex}>
                                                <InlineText content={item} />
                                            </li>
                                        ))}
                                    </ul>
                                )
                            default:
                                return (
                                    <p key={index}>
                                        <InlineText content={block.content} />
                                    </p>
                                )
                        }
                    })}
                </article>
            </main>
            <Footer />
        </div>
    )
}
