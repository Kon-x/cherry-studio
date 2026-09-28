import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cacheService } from '@data/CacheService'

vi.unmock('@data/CacheService')
vi.unmock('@data/hooks/useCache')

import { useClassicLayoutRightPaneOpen } from '../useClassicLayoutRightPaneOpen'
import { useWindowScopedPersistCache } from '../useWindowScopedPersistCache'

const useMismatchedWindowCachePair = () => {
  // @ts-expect-error number persistence cannot seed a boolean window cache
  return useWindowScopedPersistCache('ui.chat.sidebar.width', 'ui.window.chat.right_pane_open_override')
}
void useMismatchedWindowCachePair

describe('useClassicLayoutRightPaneOpen', () => {
  beforeEach(() => {
    cacheService.setPersist('ui.chat.right_pane_open_override', null)
  })

  afterEach(() => {
    cleanup()
    cacheService.cleanup()
  })

  it('uses the page default when chat has no explicit override', () => {
    cacheService.setPersist('ui.chat.right_pane_open_override', null)

    const right = renderHook(() => useClassicLayoutRightPaneOpen('chat', { enabled: true, defaultOpen: true }))
    const left = renderHook(() => useClassicLayoutRightPaneOpen('chat', { enabled: true, defaultOpen: false }))

    expect(right.result.current[0]).toBe(true)
    expect(left.result.current[0]).toBe(false)
  })

  it('lets an explicit false override a right-side default across remounts', () => {
    const first = renderHook(() => useClassicLayoutRightPaneOpen('chat', { enabled: true, defaultOpen: true }))

    const setFirstOpen = first.result.current[1]
    act(() => setFirstOpen(false))
    expect(cacheService.getPersist('ui.chat.right_pane_open_override')).toBe(false)
    first.unmount()

    const second = renderHook(() => useClassicLayoutRightPaneOpen('chat', { enabled: true, defaultOpen: true }))
    expect(second.result.current[0]).toBe(false)
  })

  it('lets an explicit true override a left-side default', () => {
    cacheService.setPersist('ui.chat.right_pane_open_override', true)

    const { result } = renderHook(() => useClassicLayoutRightPaneOpen('chat', { enabled: true, defaultOpen: false }))

    expect(result.current[0]).toBe(true)
  })

  it('stays closed and ignores normal writes outside classic layout', () => {
    cacheService.setPersist('ui.chat.right_pane_open_override', true)
    const { result } = renderHook(() => useClassicLayoutRightPaneOpen('chat', { enabled: false, defaultOpen: true }))

    expect(result.current[0]).toBe(false)
    const setOpen = result.current[1]
    act(() => setOpen(false))
    expect(cacheService.getPersist('ui.chat.right_pane_open_override')).toBe(true)
  })

  it('allows a forced write while the layout preference is changing', () => {
    const { result } = renderHook(() => useClassicLayoutRightPaneOpen('chat', { enabled: false, defaultOpen: false }))

    const setOpen = result.current[1]
    act(() => setOpen(true, { force: true }))

    expect(cacheService.getPersist('ui.chat.right_pane_open_override')).toBe(true)
  })
})
