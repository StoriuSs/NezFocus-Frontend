import { useEffect } from 'react'
import { useServers } from '../../api/useServers'
import { useMembershipDialogs } from '../../membership-dialogs.store'
import { DeleteServerDialog } from './DeleteServerDialog'
import { LeaveServerDialog } from './LeaveServerDialog'
import { TransferOwnershipDialog } from './TransferOwnershipDialog'

/**
 * Whichever leave, hand over or delete dialog is open (membership-dialogs
 * store), on the server as the list has it now. A server gone from the list
 * (left in another tab, deleted by its owner) takes its dialog with it.
 * Default export: the AppShell loads it the first time one opens.
 */
export default function MembershipDialogs() {
    const open = useMembershipDialogs((state) => state.open)
    const hide = useMembershipDialogs((state) => state.hide)
    const servers = useServers().data
    const server = servers?.find((candidate) => candidate.id === open?.serverId)
    // Closed, not only hidden: back in the list later, it would open again.
    const gone = open !== null && servers !== undefined && !server
    useEffect(() => {
        if (gone) hide()
    }, [gone, hide])
    if (!open || !server) return null

    // A key per dialog: each opens fresh, even on the same server.
    switch (open.kind) {
        case 'leave':
            return <LeaveServerDialog key='leave' server={server} onClose={hide} />
        case 'transfer':
            return (
                <TransferOwnershipDialog
                    key='transfer'
                    server={server}
                    recipient={open.recipient}
                    thenLeave={open.thenLeave}
                    onClose={hide}
                />
            )
        case 'delete':
            return <DeleteServerDialog key='delete' server={server} onClose={hide} />
    }
}
