import type { SidebarFavoriteItem } from '@shared/data/preference/preferenceTypes'
import { describe, expect, it } from 'vitest'

import {
  getOrderedLaunchpadApps,
  getOrderedVisibleSidebarFavoriteItems,
  getSidebarDefaultLandingUrl,
  getSidebarMenuPath,
  removeSidebarEntityFavorite,
  reorderLaunchpadApps,
  reorderSidebarFavorites,
  resolveSidebarActiveItem,
  setSidebarAppPinned,
  toggleSidebarEntityFavorite
} from '../sidebar'

const chat: SidebarFavoriteItem = { type: 'app', id: 'assistants' }
const notes: SidebarFavoriteItem = { type: 'app', id: 'notes' }
const custom: SidebarFavoriteItem = { type: 'assistant', id: 'custom' }

describe('retained sidebar favorites', () => {
  it('deduplicates valid favorites without changing their order or extra metadata', () => {
    const named = { ...custom, label: 'My assistant' }
    expect(getOrderedVisibleSidebarFavoriteItems([notes, named, chat, notes])).toEqual([notes, named, chat])
  })

  it('appends new pins and removes existing pins while keeping one app available', () => {
    expect(setSidebarAppPinned([custom, chat], 'notes', true)).toEqual([custom, chat, notes])
    expect(setSidebarAppPinned([notes, custom, chat], 'assistants', false)).toEqual([notes, custom])
    expect(setSidebarAppPinned([custom, chat], 'assistants', false)).toEqual([custom, chat])
  })

  it('toggles custom assistants without changing other favorites', () => {
    expect(toggleSidebarEntityFavorite([chat, notes], 'assistant', 'custom')).toEqual([chat, notes, custom])
    expect(toggleSidebarEntityFavorite([chat, custom, notes], 'assistant', 'custom')).toEqual([chat, notes])
    expect(removeSidebarEntityFavorite([custom, chat, notes], 'assistant', 'custom')).toEqual([chat, notes])
  })

  it('keeps omitted favorites on partial reorders and ignores unknown requests', () => {
    expect(reorderSidebarFavorites([chat, custom, notes], [notes, notes, { type: 'assistant', id: 'absent' }])).toEqual(
      [notes, chat, custom]
    )
  })

  it('preserves future favorite types on mutation without rendering them', () => {
    const future = { type: 'future', id: 'x', label: 'Keep me' } as unknown as SidebarFavoriteItem
    expect(getOrderedVisibleSidebarFavoriteItems([future, chat])).toEqual([chat])
    expect(setSidebarAppPinned([future, chat], 'notes', true)).toEqual([chat, notes, future])
  })

  it('resolves chat conversations and the configured painting provider', () => {
    expect(resolveSidebarActiveItem('/app/chat?topicId=custom')).toBe('assistants')
    expect(getSidebarMenuPath('paintings', 'openai')).toBe('/app/paintings/openai')
    expect(getSidebarDefaultLandingUrl([custom, notes, chat], 'openai')).toBe('/app/notes')
  })
})

describe('launchpad order', () => {
  it('filters retired and duplicate entries while retaining the rest of the saved order', () => {
    expect(getOrderedLaunchpadApps(['agents', 'notes', 'mini_app', 'files', 'notes', 'code_tools'])).toEqual([
      'notes',
      'files',
      'assistants',
      'paintings',
      'translate',
      'knowledge'
    ])
  })

  it('keeps every retained app once when an incomplete reorder is requested', () => {
    expect(reorderLaunchpadApps(['notes', 'files'], ['files', 'agents', 'files'])).toEqual([
      'files',
      'notes',
      'assistants',
      'paintings',
      'translate',
      'knowledge'
    ])
  })
})
