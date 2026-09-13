import { getSidebarApp, type SidebarApp, tabBelongsToApp } from '@renderer/utils/sidebar'
import type { Tab } from '@shared/data/cache/cacheValueTypes'
import type { ConversationNavigationTarget } from '@shared/types/navigation'

export function getConversationSidebarApp(): SidebarApp | undefined {
  return getSidebarApp('assistants')
}

export function findConversationTab(tabs: readonly Tab[], target: ConversationNavigationTarget): Tab | undefined {
  const app = getConversationSidebarApp()
  if (!app?.conversationRoute) return undefined

  return tabs.find(
    (tab) =>
      tab.type === 'route' &&
      tabBelongsToApp(app, tab.url) &&
      app.conversationRoute?.keyFromUrl(tab.url) === target.conversationId
  )
}
