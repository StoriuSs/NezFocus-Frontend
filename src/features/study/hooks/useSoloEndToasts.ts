import { createElement, useEffect, useRef } from 'react'
import { LampDesk } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { forgetSoloEnded, useStudyStore } from '../study.store'

/**
 * The toasts of one's Solo ending, on every page, in the shell's words (08
 * S-STUDY-02): a room's session this tab joined or started took it, "Đã
 * dừng học một mình · 18 phút"; one someone else started in one's room took
 * it, `lamp-desk` "Phiên học chung đã bắt đầu · học một mình đã dừng · 18
 * phút đã được tính" (Q7); stopped from the dock off its page, "Đã dừng học
 * một mình · 18 phút đã được tính" (Q11; on its page the summary says it).
 * Under a minute, no minutes. One toast per Solo, none for one ended before
 * this mounted. Off the Solo page, an end its toast said is forgotten then:
 * the Solo page opened later starts empty. One that ended with no toast
 * (expired, stopped elsewhere) stays for the Solo page to say (D-234).
 */
export function useSoloEndToasts(onSoloPage: boolean): void {
    const { t } = useTranslation()
    const ended = useStudyStore((state) => state.soloEnded)
    const told = useRef(ended?.session.id ?? null)

    useEffect(() => {
        if (!ended || told.current === ended.session.id) return
        told.current = ended.session.id
        const count = Math.floor((ended.session.countedSeconds ?? 0) / 60)
        if (ended.yieldedHere) {
            toast(count > 0 ? t('shell.study.soloYielded', { count }) : t('shell.study.soloStoppedShort'))
        } else if (ended.session.endedReason === 'joined_room') {
            toast(count > 0 ? t('shell.study.soloTaken', { count }) : t('shell.study.soloTakenShort'), {
                icon: createElement(LampDesk, { className: 'size-4', 'aria-hidden': true })
            })
        } else if (ended.stoppedHere && !onSoloPage) {
            toast(count > 0 ? t('shell.study.soloStopped', { count }) : t('shell.study.soloStoppedShort'))
        } else return
        if (!onSoloPage) forgetSoloEnded()
    }, [ended, onSoloPage, t])
}
