import { MockUseCacheUtils } from '@test-mocks/renderer/useCache'
// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useTabsContext } from '@renderer/hooks/tab'
import type { Tab } from '@shared/data/cache/cacheValueTypes'

import { TabsProvider } from '../TabsProvider'

const notesTab: Tab = {
  id: 'notes',
  type: 'route',
  url: '/app/notes?noteId=example',
  title: 'Example'
}
const normalTabs: Tab[] = ['first', 'middle', 'last'].map((id) => ({
  id,
  type: 'route',
  url: `/app/chat?topicId=${id}`,
  title: id
}))

beforeEach(() => {
  MockUseCacheUtils.resetMocks()
  MockUseCacheUtils.setPersistCacheValue('ui.tab.normal_tabs', normalTabs)
  MockUseCacheUtils.setPersistCacheValue('ui.tab.active_tab_id', 'middle')
})
afterEach(cleanup)

function renderTabs() {
  return renderHook(useTabsContext, { wrapper: ({ children }) => <TabsProvider>{children}</TabsProvider> })
}

describe('tab placement', () => {
  it('appends to the end when explicitly requested from a middle tab', () => {
    const { result } = renderTabs()
    act(() => {
      result.current.openTab('/app/launchpad', { id: 'launchpad', position: 'end' })
    })

    expect(result.current.tabs.map((tab) => tab.id)).toEqual(['first', 'middle', 'last', 'launchpad'])
    expect(result.current.activeTabId).toBe('launchpad')
  })

  it.each(['openTab', 'attachTab'] as const)('inserts %s to the right of the active tab', (entry) => {
    const { result } = renderTabs()

    act(() => {
      if (entry === 'openTab') result.current.openTab(notesTab.url, { id: notesTab.id })
      else result.current.attachTab(notesTab)
    })

    expect(result.current.tabs.map((tab) => tab.id)).toEqual(['first', 'middle', 'notes', 'last'])
    expect(result.current.activeTabId).toBe('notes')
  })

  it('appends after the last tab when it is active', () => {
    const { result } = renderTabs()
    act(() => result.current.setActiveTab('last'))
    act(() => result.current.attachTab(notesTab))

    expect(result.current.tabs.map((tab) => tab.id)).toEqual(['first', 'middle', 'last', 'notes'])
  })

  it('inserts at the start of normal tabs when a pinned tab is active', () => {
    MockUseCacheUtils.setPersistCacheValue(
      'ui.tab.pinned_tabs',
      ['pin-1', 'pin-2'].map((id) => ({ ...normalTabs[0], id, isPinned: true }))
    )
    MockUseCacheUtils.setPersistCacheValue('ui.tab.active_tab_id', 'pin-1')
    const { result } = renderTabs()
    act(() => result.current.attachTab(notesTab))

    expect(result.current.tabs.map((tab) => tab.id)).toEqual(['pin-1', 'pin-2', 'notes', 'first', 'middle', 'last'])
    expect(result.current.tabs.find((tab) => tab.id === 'notes')?.isPinned).toBeFalsy()
  })

  it('activates an existing notes tab without moving or duplicating it', () => {
    MockUseCacheUtils.setPersistCacheValue('ui.tab.normal_tabs', [...normalTabs, notesTab])
    const { result } = renderTabs()
    act(() => {
      result.current.openTab(notesTab.url)
    })

    expect(result.current.tabs.map((tab) => tab.id)).toEqual(['first', 'middle', 'last', 'notes'])
    expect(result.current.activeTabId).toBe('notes')
  })

  it('uses the latest active tab when multiple links open before a render', () => {
    const { result } = renderTabs()
    act(() => {
      result.current.attachTab(notesTab)
      result.current.attachTab({ ...notesTab, id: 'second-notes', url: '/app/notes?noteId=second' })
    })

    expect(result.current.tabs.map((tab) => tab.id)).toEqual(['first', 'middle', 'notes', 'second-notes', 'last'])
    expect(result.current.activeTabId).toBe('second-notes')
  })

  it('uses the same insertion rule for non-notes tabs', () => {
    const { result } = renderTabs()
    act(() => {
      result.current.openTab('/app/files', { id: 'files' })
    })

    expect(result.current.tabs.map((tab) => tab.id)).toEqual(['first', 'middle', 'files', 'last'])
  })
})
