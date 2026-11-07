import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

/**
 * SaveBar (C-27): the save bar of a settings form with text fields (S-ME-02).
 * Place it last in the form, shown only while the form has changes: it
 * floats 24 above the bottom of the content area, as wide as the content,
 * and at the end of the page it sits after the last field, never over it.
 * "Save changes" submits the form.
 */
export function SaveBar({ saving, onDiscard }: { saving: boolean; onDiscard: () => void }) {
    const { t } = useTranslation()
    return (
        <div className='sticky bottom-6 mt-auto pt-8'>
            <div className='flex h-16 items-center gap-3 rounded-button border bg-surface-2 pl-5 pr-3 shadow-float'>
                <p className='flex-1 text-body-sm text-text-primary'>{t('saveBar.unsaved')}</p>
                <Button type='button' variant='text' size='sm' disabled={saving} onClick={onDiscard}>
                    {t('saveBar.discard')}
                </Button>
                <Button type='submit' size='sm' disabled={saving}>
                    {saving ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                    {t('saveBar.save')}
                </Button>
            </div>
        </div>
    )
}
