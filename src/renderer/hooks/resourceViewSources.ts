import { dataApiService } from '@data/DataApiService'
import type { Topic as RendererTopic } from '@renderer/types/topic'
import type { Topic as ApiTopic } from '@shared/data/types/topic'
import { createContext, use, useCallback } from 'react'

import { mapApiTopicToRendererTopic, useTopics } from './useTopic'

export function useRawAssistantTopicsSource({ enabled }: { enabled?: boolean } = {}) {
  const listSource = useTopics({ loadAll: true, enabled })
  const loadLatestTopic = useCallback(async (assistantId?: string | null) => {
    const result =
      assistantId === undefined
        ? await dataApiService.get('/topics/latest')
        : await dataApiService.get('/topics/latest', { query: { assistantId: assistantId ?? 'unlinked' } })
    return result.topic
  }, [])
  const reuseOrCreateTopic = useCallback(async (assistantId: string | null, excludeTopicId?: string) => {
    return dataApiService.post('/topics/reusable-placeholder', {
      body: { assistantId, ...(excludeTopicId ? { excludeTopicId } : {}) }
    })
  }, [])

  return { ...listSource, loadLatestTopic, reuseOrCreateTopic }
}

type RawAssistantTopicsSource = ReturnType<typeof useRawAssistantTopicsSource>
/**
 * A background refresh that failed while a committed snapshot is still on
 * screen. It is deliberately separate from `error`: the snapshot stays served
 * (blowing a good list away into an error panel is worse), but the failure must
 * not be silent — nothing retries on its own, so the list would otherwise stay
 * stale for the window's lifetime with no visible cause.
 */
type RefreshError = { refreshError: RawAssistantTopicsSource['error'] }

/**
 * View of the full topic list derived once per window (in
 * ResourceViewSourceProvider), so every kept-alive tab shares one mapped copy
 * instead of each remapping — and re-joining an order signature over — the
 * entire list.
 */
export type AssistantTopicsView = {
  /** `topics` mapped to the renderer {@link RendererTopic} shape. */
  rendererTopics: readonly RendererTopic[]
  /** Signature over order-relevant fields (id / assistantId / orderKey). */
  orderSignature: string
}

export function deriveAssistantTopicsView(topics: readonly ApiTopic[]): AssistantTopicsView {
  return {
    rendererTopics: topics.map(mapApiTopicToRendererTopic),
    orderSignature: topics.map((t) => `${t.id}:${t.assistantId ?? ''}:${t.orderKey ?? ''}`).join('|')
  }
}

export type AssistantTopicsSource = Pick<
  RawAssistantTopicsSource,
  | 'topics'
  | 'isLoadingAll'
  | 'isFullyLoaded'
  | 'isRefreshing'
  | 'error'
  | 'refetch'
  | 'loadLatestTopic'
  | 'reuseOrCreateTopic'
> &
  RefreshError &
  AssistantTopicsView
export const AssistantTopicsSourceContext = createContext<AssistantTopicsSource | null>(null)

export function useAssistantTopicsSource(): AssistantTopicsSource {
  const source = use(AssistantTopicsSourceContext)
  if (!source) {
    throw new Error('useAssistantTopicsSource must be used within ResourceViewSourceProvider')
  }
  return source
}
