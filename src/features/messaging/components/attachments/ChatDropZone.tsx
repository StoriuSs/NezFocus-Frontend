import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Lock, Timer, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { endsAtText } from '@/lib/time-zones'
import { settingsCache } from '@/features/users'
import { addToTray } from '../../api/attachmentUploads'
import { useUploads } from '../../attachment-tray.store'
import { useChooseFiles } from '../../hooks/useChooseFiles'
import type { ChatPermissions } from '../../types'

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false

/**
 * Files dragged onto a channel's page (C-12 `drop-target`, `drop-blocked`;
 * S-CHAT-04): drawn by the page inside its content column, over it from the
 * Header to the bottom of the composer, and listening on that column (the
 * element it is drawn in). While files are dragged over it: two layers of
 * scrim, a 2-wide `primary` frame 16 in, `upload` 40, "Thả tệp để gửi vào
 * #hoi-dap" and the limits; dropped, they go to the tray as chosen ones do
 * (too big, too many, of a type not sent: a Toast). One who cannot send
 * files here sees why instead, with no frame, and a drop does nothing. The
 * rail, the channel list and the right panel are not covered. Dropped
 * anywhere else on the page, a file does nothing, rather than the browser
 * opening it in place of the app.
 *
 * Without files here, why, as the shut composer says it: `timer` "Timed out
 * until 22:30" · "You can't send messages yet, files included"; `lock` for a
 * channel only moderators post in, a server that gives no SEND_MESSAGES, or
 * no ATTACH_FILES.
 */
export function ChatDropZone({
    channelId,
    channelName,
    permissions
}: {
    channelId: string
    channelName: string
    permissions: Pick<ChatPermissions, 'sendBlocked' | 'attachFiles'>
}) {
    const { t, i18n } = useTranslation('messaging')
    const timeZone = useQuery(settingsCache).data?.timezone
    const self = useRef<HTMLDivElement>(null)
    const [dragging, setDragging] = useState(false)
    const allowed = permissions.attachFiles
    const blocked = permissions.sendBlocked
    const inTray = useUploads((state) => state.trays[channelId]?.length ?? 0)
    const add = useCallback((files: File[]) => addToTray(channelId, files), [channelId])
    const choose = useChooseFiles(add, inTray, allowed)
    // The latest, read at the drop: listening again would forget how deep the drag is.
    const chosen = useRef(choose)
    useEffect(() => {
        chosen.current = choose
    }, [choose])

    useEffect(() => {
        const zone = self.current?.parentElement
        if (!zone) return
        // Entering a child leaves its parent: only the last leave ends the drag.
        let depth = 0
        const enter = (event: DragEvent) => {
            if (!carriesFiles(event)) return
            event.preventDefault()
            depth += 1
            setDragging(true)
        }
        const over = (event: DragEvent) => {
            if (!carriesFiles(event)) return
            event.preventDefault()
            event.dataTransfer!.dropEffect = allowed ? 'copy' : 'none'
        }
        const leave = (event: DragEvent) => {
            if (!carriesFiles(event)) return
            depth = Math.max(0, depth - 1)
            if (!depth) setDragging(false)
        }
        const drop = (event: DragEvent) => {
            if (!carriesFiles(event)) return
            event.preventDefault()
            depth = 0
            setDragging(false)
            if (allowed) chosen.current([...event.dataTransfer!.files])
        }
        // Outside the column: nothing happens, rather than the browser opening the file;
        // another place that takes files (a new server's picture) has said so already.
        const elsewhere = (event: DragEvent) => {
            if (!carriesFiles(event) || event.defaultPrevented || zone.contains(event.target as Node)) return
            event.preventDefault()
            event.dataTransfer!.dropEffect = 'none'
        }
        const listeners = [
            ['dragenter', enter],
            ['dragover', over],
            ['dragleave', leave],
            ['drop', drop]
        ] as const
        for (const [type, listener] of listeners) zone.addEventListener(type, listener)
        window.addEventListener('dragover', elsewhere)
        window.addEventListener('drop', elsewhere)
        return () => {
            for (const [type, listener] of listeners) zone.removeEventListener(type, listener)
            window.removeEventListener('dragover', elsewhere)
            window.removeEventListener('drop', elsewhere)
        }
    }, [allowed])

    return (
        <div
            ref={self}
            data-testid='drop-zone'
            hidden={!dragging}
            className={dragging ? 'pointer-events-none absolute inset-0 flex flex-col' : undefined}
            style={COVER}
        >
            <div
                className='flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center'
                style={allowed ? FRAME : undefined}
            >
                {allowed ? (
                    <>
                        <Upload className='text-primary' style={ICON} aria-hidden='true' />
                        <p className='text-title-2 font-semibold text-text-primary'>
                            {t('attach.dropTitle', { channel: channelName })}
                        </p>
                        <p className='text-body-sm text-text-secondary'>{t('attach.dropLimits')}</p>
                    </>
                ) : blocked?.reason === 'timed-out' ? (
                    <>
                        <Timer className='text-text-secondary' style={ICON} aria-hidden='true' />
                        <p className='text-title-2 font-semibold text-text-secondary'>
                            {t('attach.timedOut', {
                                time: endsAtText(new Date(blocked.until), new Date(), i18n.language, timeZone)
                            })}
                        </p>
                        <p className='text-body-sm text-text-secondary'>{t('attach.timedOutNote')}</p>
                    </>
                ) : (
                    <>
                        <Lock className='text-text-secondary' style={ICON} aria-hidden='true' />
                        <p className='text-title-2 font-semibold text-text-secondary'>
                            {!blocked
                                ? t('attach.notAllowed')
                                : blocked.reason === 'managers-only'
                                  ? t('composer.disabled.managersOnly')
                                  : t('composer.disabled.noPermission')}
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}

/** Two layers of scrim (≈ `bg` 84%), 16 in to the frame, over the list and its sticky bars. */
const COVER = {
    background: 'linear-gradient(var(--scrim), var(--scrim)), var(--scrim)',
    padding: 16,
    zIndex: 30
}
/** `rounded.sheet` (24) inline: no other class of the chat has it. */
const FRAME = { border: '2px solid rgb(var(--primary))', borderRadius: 24 }
const ICON = { width: 40, height: 40 }
