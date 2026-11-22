import { createElement, useRef } from 'react'
import { Link2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/servers'
import { getApiErrorType, NETWORK_ERROR } from '@/lib/api-error'
import { useCreateInvite } from '../api/useInvites'
import { useInviteDialogs } from '../invite-dialogs.store'
import { DEFAULT_INVITE_SETTINGS, inviteLink } from '../lib/invites'
import { channelPath } from '../lib/paths'
import { can } from '../lib/permissions'
import type { Server, ServerChannel } from '../types'

const ICON = { className: 'size-4' }

/**
 * "Mời vào phòng" (07 S-ROOM-02 `invite-copied`, Q11; D-218): copied at
 * once, no dialog. With CREATE_INVITE, the server's invite link of the
 * default settings (made or handed back again, D-151) with the room as its
 * `?channel=` (D-150), and a Toast whose "Đổi thiết lập" opens the invite
 * panel for the room (03 S-SRV-02 `room`); without it, the room's own
 * address (STUDY-10), which only members open. The browser refusing to copy:
 * the panel opens, its link there to select (without CREATE_INVITE, a Toast
 * with the address to copy by hand); the link not made: a Toast says so. A
 * second press while the first is on its way does nothing.
 */
export function useRoomInvite(server: Server, channel: ServerChannel): { invite: () => void; busy: boolean } {
    const { t } = useTranslation('servers')
    const create = useCreateInvite(server.id)
    const showInvite = useInviteDialogs((state) => state.showInvite)
    const mayInvite = can(server.permissions, 'CREATE_INVITE')
    const room = channel.name
    const going = useRef(false)

    async function invite() {
        if (going.current) return
        going.current = true
        try {
            await copyInvite()
        } finally {
            going.current = false
        }
    }

    async function copyInvite() {
        let link: string
        if (mayInvite) {
            try {
                link = inviteLink((await create.mutateAsync(DEFAULT_INVITE_SETTINGS)).code, channel.id)
            } catch (error) {
                toast.error(t(getApiErrorType(error) === NETWORK_ERROR ? 'invite.offline' : 'invite.failed'))
                return
            }
        } else {
            link = `${window.location.origin}${channelPath(server.id, channel.id)}`
        }
        try {
            await navigator.clipboard.writeText(link)
        } catch {
            if (mayInvite) showInvite(server.id, false, channel.id)
            else toast(t('invite.roomLinkManual', { link }), { id: 'invite-copied', duration: 10_000 })
            return
        }
        toast(t(mayInvite ? 'invite.roomCopied' : 'invite.roomLinkCopied', { room }), {
            id: 'invite-copied',
            icon: createElement(Link2, ICON),
            ...(mayInvite
                ? {
                      action: {
                          label: t('invite.editSettings'),
                          onClick: () => showInvite(server.id, false, channel.id)
                      }
                  }
                : {})
        })
    }

    return { invite: () => void invite(), busy: create.isPending }
}
