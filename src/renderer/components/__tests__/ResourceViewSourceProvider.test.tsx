import { ResourceViewSourceProvider } from '@renderer/components/ResourceViewSourceProvider'
import type * as ResourceViewSourcesModule from '@renderer/hooks/resourceViewSources'
import { type AssistantTopicsSource, useAssistantTopicsSource } from '@renderer/hooks/resourceViewSources'
import type * as TabHooksModule from '@renderer/hooks/tab'
import type { Tab } from '@shared/data/cache/cacheValueTypes'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sourceMocks = vi.hoisted(() => ({
  tabs: [] as Tab[],
  activeTabId: null as string | null,
  assistantEnabled: [] as Array<boolean | undefined>,
  assistantSource: undefined as unknown
}))
const sourceProbeRenders = vi.fn()

vi.mock('@renderer/hooks/tab', async (importOriginal) => {
  const actual = await importOriginal<typeof TabHooksModule>()

  return {
    ...actual,
    useTabs: () => ({ activeTabId: sourceMocks.activeTabId, tabs: sourceMocks.tabs })
  }
})

vi.mock('@renderer/hooks/resourceViewSources', async (importOriginal) => {
  const actual = await importOriginal<typeof ResourceViewSourcesModule>()

  return {
    ...actual,
    useRawAssistantTopicsSource: ({ enabled }: { enabled?: boolean } = {}) => {
      sourceMocks.assistantEnabled.push(enabled)
      return sourceMocks.assistantSource
    }
  }
})

function createTab(id: string, url: string, isDormant = false): Tab {
  return {
    id,
    type: 'route',
    url,
    title: id,
    isDormant
  }
}

function createAssistantSource(
  ids: string[],
  {
    complete,
    refreshing = false,
    error
  }: {
    complete: boolean
    refreshing?: boolean
    error?: Error
  }
): AssistantTopicsSource {
  const topics = ids.map((id) => ({ id }))

  return {
    topics,
    pages: [{ items: topics, nextCursor: complete ? undefined : 'next' }],
    hasNext: !complete,
    loadNext: vi.fn(),
    isLoading: ids.length === 0,
    isLoadingAll: !complete,
    isFullyLoaded: complete,
    isRefreshing: refreshing,
    error,
    refetch: vi.fn(),
    loadLatestTopic: vi.fn().mockResolvedValue(null),
    reuseOrCreateTopic: vi.fn(),
    mutate: vi.fn()
  } as unknown as AssistantTopicsSource
}

function SourceProbe() {
  sourceProbeRenders()
  const topicsSource = useAssistantTopicsSource()

  return (
    <>
      <span data-testid="topic-ids">{topicsSource.topics.map((topic) => topic.id).join(',')}</span>
      <span data-testid="renderer-topic-ids">{topicsSource.rendererTopics.map((topic) => topic.id).join(',')}</span>
      <span data-testid="topics-loading">{String(topicsSource.isLoadingAll)}</span>
      <span data-testid="topics-refreshing">{String(topicsSource.isRefreshing)}</span>
      <span data-testid="topics-error">{String(Boolean(topicsSource.error))}</span>
      <span data-testid="topics-refresh-error">{String(Boolean(topicsSource.refreshError))}</span>
    </>
  )
}

const createProviderTree = () => (
  <ResourceViewSourceProvider>
    <SourceProbe />
  </ResourceViewSourceProvider>
)

describe('ResourceViewSourceProvider', () => {
  beforeEach(() => {
    sourceMocks.tabs = []
    sourceMocks.activeTabId = null
    sourceMocks.assistantEnabled = []
    sourceMocks.assistantSource = createAssistantSource([], { complete: false })
    sourceProbeRenders.mockClear()
  })

  it('publishes progressive assistant topics on cold start and keeps the complete snapshot stable during refresh', async () => {
    sourceMocks.tabs = [createTab('chat', '/app/chat')]
    sourceMocks.activeTabId = 'chat'
    sourceMocks.assistantSource = createAssistantSource(['partial'], { complete: false })

    const { rerender } = render(createProviderTree())

    expect(screen.getByTestId('topic-ids')).toHaveTextContent('partial')
    expect(screen.getByTestId('topics-loading')).toHaveTextContent('true')

    sourceMocks.assistantSource = createAssistantSource(['topic-1', 'topic-2'], { complete: true })
    rerender(createProviderTree())

    await waitFor(() => expect(screen.getByTestId('topic-ids')).toHaveTextContent('topic-1,topic-2'))

    sourceMocks.assistantSource = createAssistantSource(['replacement-partial'], {
      complete: false,
      refreshing: true
    })
    rerender(createProviderTree())

    expect(screen.getByTestId('topic-ids')).toHaveTextContent('topic-1,topic-2')
    expect(screen.getByTestId('topics-loading')).toHaveTextContent('false')
    expect(screen.getByTestId('topics-refreshing')).toHaveTextContent('true')

    sourceMocks.assistantSource = createAssistantSource(['topic-3'], { complete: true })
    rerender(createProviderTree())

    await waitFor(() => expect(screen.getByTestId('topic-ids')).toHaveTextContent('topic-3'))
  })

  it('stops reporting refreshing when a failed background refresh goes idle', async () => {
    sourceMocks.tabs = [createTab('chat', '/app/chat'), createTab('agent', '/app/agents')]
    sourceMocks.activeTabId = 'chat'
    sourceMocks.assistantSource = createAssistantSource(['topic-1'], { complete: true })

    const { rerender } = render(createProviderTree())

    await waitFor(() => expect(screen.getByTestId('topic-ids')).toHaveTextContent('topic-1'))

    // A mid-chain load-all failure leaves the source incomplete and idle. The
    // stale snapshot stays published, but the refreshing flag must clear so
    // consumers (e.g. reorder gating) do not hang on it indefinitely.
    sourceMocks.assistantSource = createAssistantSource(['replacement-partial'], {
      complete: false,
      refreshing: false,
      error: new Error('refresh failed')
    })
    rerender(createProviderTree())

    expect(screen.getByTestId('topic-ids')).toHaveTextContent('topic-1')
    expect(screen.getByTestId('topics-refreshing')).toHaveTextContent('false')
  })

  it('releases the mapped topic view when no awake assistant list consumes it', async () => {
    sourceMocks.tabs = [createTab('chat', '/app/chat')]
    sourceMocks.activeTabId = 'chat'
    sourceMocks.assistantSource = createAssistantSource(['topic-1'], { complete: true })

    const { rerender } = render(createProviderTree())

    await waitFor(() => expect(screen.getByTestId('renderer-topic-ids')).toHaveTextContent('topic-1'))

    sourceMocks.tabs = [createTab('chat', '/app/chat', true), createTab('settings', '/settings/about')]
    sourceMocks.activeTabId = 'settings'
    rerender(createProviderTree())

    expect(screen.getByTestId('topic-ids')).toHaveTextContent('topic-1')
    expect(screen.getByTestId('renderer-topic-ids')).toBeEmptyDOMElement()
  })

  it('reports a failed background refresh without tearing down the stale snapshot', async () => {
    sourceMocks.tabs = [createTab('chat', '/app/chat')]
    sourceMocks.activeTabId = 'chat'
    sourceMocks.assistantSource = createAssistantSource(['topic-1'], { complete: true })

    const { rerender } = render(createProviderTree())

    await waitFor(() => expect(screen.getByTestId('topic-ids')).toHaveTextContent('topic-1'))
    expect(screen.getByTestId('topics-refresh-error')).toHaveTextContent('false')

    sourceMocks.assistantSource = createAssistantSource(['replacement-partial'], {
      complete: false,
      error: new Error('refresh failed')
    })
    rerender(createProviderTree())

    // `error` stays clear so the list is not replaced by an error panel, but
    // the failure has to reach consumers somehow — nothing retries on its own.
    expect(screen.getByTestId('topic-ids')).toHaveTextContent('topic-1')
    expect(screen.getByTestId('topics-error')).toHaveTextContent('false')
    expect(screen.getByTestId('topics-refresh-error')).toHaveTextContent('true')
  })

  it('loads only the source owned by the active non-dormant route tab', () => {
    sourceMocks.tabs = [
      createTab('agent-dormant', '/app/agents?sessionId=session-1', true),
      createTab('chat', '/app/chat?topicId=topic-2')
    ]
    sourceMocks.activeTabId = 'chat'

    render(createProviderTree())

    expect(sourceMocks.assistantEnabled.at(-1)).toBe(true)
  })
})
