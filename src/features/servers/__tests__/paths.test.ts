import { describe, it, expect } from 'vitest'
import { matchPath } from 'react-router-dom'
import {
    channelPath,
    invitePath,
    messageLink,
    messagePath,
    roleEditPath,
    SERVERS_PATHS,
    serverSettingsPath
} from '@/features/servers/lib/paths'

describe('the servers paths', () => {
    it('build the addresses the pages had before SERVERS_PATHS', () => {
        expect(channelPath('ot', 'hoi-dap')).toBe('/channels/ot/hoi-dap')
        // No text channel: the server alone, with no slash after it.
        expect(channelPath('ot')).toBe('/channels/ot')
        expect(serverSettingsPath('ot')).toBe('/servers/ot/settings')
        expect(serverSettingsPath('ot', 'members')).toBe('/servers/ot/settings/members')
        expect(roleEditPath('ot', 'mod')).toBe('/servers/ot/settings/roles/mod')
        expect(invitePath('Ab12Cd34')).toBe('/invite/Ab12Cd34')
    })

    it('build what the routes declare, so a link opens its page', () => {
        expect(matchPath(SERVERS_PATHS.channel, channelPath('ot', 'hoi-dap'))?.params).toEqual({
            serverId: 'ot',
            channelId: 'hoi-dap'
        })
        expect(matchPath(SERVERS_PATHS.channel, channelPath('ot'))?.params).toEqual({ serverId: 'ot' })
        expect(matchPath(SERVERS_PATHS.settings, serverSettingsPath('ot', 'bans'))?.params).toEqual({
            serverId: 'ot',
            section: 'bans'
        })
        expect(matchPath(SERVERS_PATHS.roleEdit, roleEditPath('ot', 'mod'))?.params).toEqual({
            serverId: 'ot',
            section: 'roles',
            roleId: 'mod'
        })
        expect(matchPath(SERVERS_PATHS.invite, invitePath('Ab12Cd34'))?.params).toEqual({ code: 'Ab12Cd34' })
    })

    it('build a link to a message that opens its route (D-48)', () => {
        expect(messagePath('ot', 'hoi-dap', 'm1')).toBe('/channels/ot/hoi-dap/m1')
        expect(messageLink('ot', 'hoi-dap', 'm1')).toBe(`${window.location.origin}/channels/ot/hoi-dap/m1`)
        expect(matchPath(SERVERS_PATHS.message, messagePath('ot', 'hoi-dap', 'm1'))?.params).toEqual({
            serverId: 'ot',
            channelId: 'hoi-dap',
            messageId: 'm1'
        })
    })
})
