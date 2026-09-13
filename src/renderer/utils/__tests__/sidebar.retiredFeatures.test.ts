import type { SidebarFavoriteItem } from '@shared/data/preference/preferenceTypes'
import { describe, expect, it } from 'vitest'

import {
  getOrderedLaunchpadApps,
  getSidebarFavoriteItems,
  reorderSidebarFavorites,
  setSidebarAppPinned
} from '../sidebar'

describe('retired feature navigation', () => {
  const favorites = [
    { type: 'app', id: 'agents' },
    { type: 'assistant', id: 'custom-assistant' },
    { type: 'mini_app', id: 'old-app' },
    { type: 'app', id: 'notes' },
    { type: 'agent', id: 'old-agent' },
    { type: 'app', id: 'code_tools' },
    { type: 'app', id: 'mini_app' },
    { type: 'app', id: 'assistants' }
  ] as SidebarFavoriteItem[]

  it('keeps the order of surviving app and custom assistant favorites', () => {
    expect(getSidebarFavoriteItems(favorites)).toEqual([
      { type: 'assistant', id: 'custom-assistant' },
      { type: 'app', id: 'notes' },
      { type: 'app', id: 'assistants' }
    ])
  })

  it('discards retired favorite types when saving a new order or pin', () => {
    const reordered = reorderSidebarFavorites(favorites, [{ type: 'app', id: 'notes' }])
    expect(reordered).toEqual([
      { type: 'app', id: 'notes' },
      { type: 'assistant', id: 'custom-assistant' },
      { type: 'app', id: 'assistants' }
    ])
    expect(setSidebarAppPinned(favorites, 'files', true)).toEqual([
      { type: 'assistant', id: 'custom-assistant' },
      { type: 'app', id: 'notes' },
      { type: 'app', id: 'assistants' },
      { type: 'app', id: 'files' }
    ])
  })

  it('restores exactly the six supported launchpad apps without reordering surviving entries', () => {
    expect(getOrderedLaunchpadApps(['code_tools', 'notes', 'agents', 'files', 'mini_app', 'dsh', 'notes'])).toEqual([
      'notes',
      'files',
      'assistants',
      'paintings',
      'translate',
      'knowledge'
    ])
  })
})
