import type { SettingsSearchEntry } from '../settingsSearch/types'

export const route = '/settings/mcp'

export const entries: SettingsSearchEntry[] = [
  {
    anchorId: 'tab-servers',
    titleKey: 'settings.mcp.title',
    route: '/settings/mcp/servers',
    aliases: ['mcp']
  },
  {
    anchorId: 'tab-marketplaces',
    titleKey: 'settings.mcp.marketplaces',
    route: '/settings/mcp/marketplaces'
  }
]
