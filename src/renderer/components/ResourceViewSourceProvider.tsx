import {
  type AssistantTopicsSource,
  AssistantTopicsSourceContext,
  type AssistantTopicsView,
  deriveAssistantTopicsView,
  useRawAssistantTopicsSource
} from '@renderer/hooks/resourceViewSources'
import { useTabs } from '@renderer/hooks/tab'
import { getSidebarApp, type SidebarAppId, tabBelongsToApp } from '@renderer/utils/sidebar'
import type { Tab } from '@shared/data/cache/cacheValueTypes'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

const EMPTY_TOPICS: ReturnType<typeof useRawAssistantTopicsSource>['topics'] = []
const EMPTY_ASSISTANT_TOPICS_VIEW: AssistantTopicsView = { rendererTopics: [], orderSignature: '' }

type AssistantTopicsSnapshot = Pick<ReturnType<typeof useRawAssistantTopicsSource>, 'pages' | 'topics'>

export function shouldLoadResourceViewSource(
  tabs: readonly Tab[],
  activeTabId: string | null | undefined,
  appId: SidebarAppId
): boolean {
  const app = getSidebarApp(appId)
  if (!app) return false

  const activeTab = tabs.find((tab) => tab.id === activeTabId)
  return Boolean(activeTab?.type === 'route' && !activeTab.isDormant && tabBelongsToApp(app, activeTab.url))
}

function useCommittedAssistantTopicsSource(enabled: boolean, retainDerivedView: boolean): AssistantTopicsSource {
  const rawSource = useRawAssistantTopicsSource({ enabled })
  const [snapshot, setSnapshot] = useState<AssistantTopicsSnapshot | null>(null)
  const rawSourceReady = enabled && rawSource.isFullyLoaded && !rawSource.isRefreshing && !rawSource.error

  useEffect(() => {
    if (!rawSourceReady) return

    setSnapshot((currentSnapshot) =>
      currentSnapshot?.pages === rawSource.pages && currentSnapshot?.topics === rawSource.topics
        ? currentSnapshot
        : {
            pages: rawSource.pages,
            topics: rawSource.topics
          }
    )
  }, [rawSource.pages, rawSource.topics, rawSourceReady])

  const isColdLoading = enabled && snapshot === null
  const snapshotIsCurrent = snapshot?.pages === rawSource.pages && snapshot?.topics === rawSource.topics
  // A failed background refresh keeps serving the stale snapshot (stale-while-
  // error). While a retry fetch is actually in flight `isRefreshing` stays
  // honest, but once the source is idle with an error, `!isFullyLoaded` alone
  // must not pin consumers in a perpetual refreshing state (e.g. reorder
  // disabled) with no visible cause.
  const isBackgroundRefreshing =
    enabled &&
    snapshot !== null &&
    (rawSource.isRefreshing ||
      (!rawSource.error && (!rawSource.isFullyLoaded || (rawSourceReady && !snapshotIsCurrent))))

  const topics = snapshot?.topics ?? (enabled ? rawSource.topics : EMPTY_TOPICS)
  // Derived once per window here — kept-alive tabs consume this shared view
  // instead of each remapping the full list (see AssistantTopicsView).
  const topicsView = useMemo(
    () => (retainDerivedView ? deriveAssistantTopicsView(topics) : EMPTY_ASSISTANT_TOPICS_VIEW),
    [retainDerivedView, topics]
  )

  return useMemo(
    () => ({
      topics,
      ...topicsView,
      isLoadingAll: isColdLoading && rawSource.isLoadingAll,
      isFullyLoaded: snapshot !== null,
      isRefreshing: isBackgroundRefreshing,
      error: snapshot ? undefined : rawSource.error,
      refreshError: snapshot ? rawSource.error : undefined,
      refetch: rawSource.refetch,
      loadLatestTopic: rawSource.loadLatestTopic,
      reuseOrCreateTopic: rawSource.reuseOrCreateTopic
    }),
    [
      isBackgroundRefreshing,
      isColdLoading,
      rawSource.error,
      rawSource.isLoadingAll,
      rawSource.loadLatestTopic,
      rawSource.reuseOrCreateTopic,
      rawSource.refetch,
      topics,
      topicsView,
      snapshot
    ]
  )
}

export function ResourceViewSourceProvider({ children }: { children: ReactNode }) {
  const { activeTabId, tabs } = useTabs()
  const assistantTopicsEnabled = useMemo(
    () => shouldLoadResourceViewSource(tabs, activeTabId, 'assistants'),
    [activeTabId, tabs]
  )
  const retainAssistantTopicsView = useMemo(() => {
    const app = getSidebarApp('assistants')
    if (!app) return false
    return tabs.some((tab) => tab.type === 'route' && !tab.isDormant && tabBelongsToApp(app, tab.url))
  }, [tabs])
  const assistantTopicsSource = useCommittedAssistantTopicsSource(assistantTopicsEnabled, retainAssistantTopicsView)
  return <AssistantTopicsSourceContext value={assistantTopicsSource}>{children}</AssistantTopicsSourceContext>
}
