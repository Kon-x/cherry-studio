import { useTabsContext } from '@renderer/hooks/tab'
import type { Tab } from '@shared/data/cache/cacheValueTypes'
import { MockUseCacheUtils } from '@test-mocks/renderer/useCache'
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TabsProvider } from '../TabsProvider'

vi.mock('@renderer/ipc', () => ({ ipcApi: { request: vi.fn() }, useIpcOn: vi.fn() }))

const tab = (id: string, url: string, isPinned = false): Tab => ({
  id,
  url,
  type: 'route',
  title: id,
  isPinned,
  isDormant: false,
  lastAccessTime: 0
})

beforeEach(() => MockUseCacheUtils.resetMocks())
afterEach(cleanup)

describe('tab restoration after feature removal', () => {
  it('opens chat on a fresh installation', () => {
    const { result } = renderHook(useTabsContext, { wrapper: TabsProvider })
    expect(result.current.activeTab).toMatchObject({ url: '/app/chat', isDormant: false })
  })

  it('opens a usable launchpad when every saved tab belongs to a retired feature', () => {
    MockUseCacheUtils.setPersistCacheValue('ui.tab.normal_tabs', [
      tab('work', '/app/agents?sessionId=old'),
      tab('code', '/app/code'),
      tab('local-app', '/app/mini-app/local'),
      { ...tab('website', 'https://example.com'), type: 'webview' }
    ])
    MockUseCacheUtils.setPersistCacheValue('ui.tab.pinned_tabs', [
      tab('openclaw', '/app/openclaw', true),
      tab('skills', '/settings/skills', true),
      tab('schedule', '/settings/scheduled-tasks/task-1', true)
    ])
    MockUseCacheUtils.setPersistCacheValue('ui.tab.active_tab_id', 'openclaw')

    const { result } = renderHook(useTabsContext, { wrapper: TabsProvider })

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.activeTab).toMatchObject({ url: '/app/launchpad', isDormant: false })
    expect(MockUseCacheUtils.getPersistCacheValue('ui.tab.pinned_tabs')).toEqual([])
    expect(MockUseCacheUtils.getPersistCacheValue('ui.tab.normal_tabs')).toEqual(result.current.tabs)
  })

  it('preserves surviving normal and pinned tab order and the selected conversation', () => {
    MockUseCacheUtils.setPersistCacheValue('ui.tab.pinned_tabs', [
      tab('files', '/app/files', true),
      tab('removed', '/app/mini-app/old', true),
      tab('notes', '/app/notes', true)
    ])
    MockUseCacheUtils.setPersistCacheValue('ui.tab.normal_tabs', [
      tab('work', '/app/agents'),
      tab('conversation', '/app/chat?topicId=kept'),
      tab('translation', '/app/translate')
    ])
    MockUseCacheUtils.setPersistCacheValue('ui.tab.active_tab_id', 'conversation')

    const { result } = renderHook(useTabsContext, { wrapper: TabsProvider })

    expect(result.current.tabs.map(({ id }) => id)).toEqual(['files', 'notes', 'conversation', 'translation'])
    expect(result.current.tabs.filter(({ isDormant }) => !isDormant).map(({ id }) => id)).toEqual(['conversation'])
    expect(result.current.activeTab?.url).toBe('/app/chat?topicId=kept')
  })

  it('selects the surviving pinned page when the old active normal tab was removed', () => {
    MockUseCacheUtils.setPersistCacheValue('ui.tab.pinned_tabs', [tab('knowledge', '/app/knowledge', true)])
    MockUseCacheUtils.setPersistCacheValue('ui.tab.normal_tabs', [tab('work', '/app/agents')])
    MockUseCacheUtils.setPersistCacheValue('ui.tab.active_tab_id', 'work')

    const { result } = renderHook(useTabsContext, { wrapper: TabsProvider })

    expect(result.current.tabs.map(({ id }) => id)).toEqual(['knowledge'])
    expect(result.current.activeTab).toMatchObject({ id: 'knowledge', isDormant: false })
  })
})
