import type { Assistant } from '@renderer/types/assistant'
import type { SidebarFavoriteItem } from '@shared/data/preference/preferenceTypes'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { resolveSidebarEntry, type SidebarVariantContext } from '../sidebarVariants'

function createContext(overrides: Partial<SidebarVariantContext> = {}): SidebarVariantContext {
  return {
    t: (key: string) => key,
    defaultPaintingProvider: 'aihubmix',
    installedAssistants: new Map<string, Assistant>(),
    assistantIconType: 'emoji',
    defaultModelId: null,
    visibleAppCount: 2,
    openApp: vi.fn(),
    openAssistant: vi.fn(),
    removeApp: vi.fn(),
    removeAssistant: vi.fn(),
    ...overrides
  }
}

function createAssistant(overrides: Partial<Assistant> = {}): Assistant {
  return { id: 'assistant-1', name: 'Alpha', emoji: '🍒', modelId: 'openai::gpt-5', ...overrides } as Assistant
}

const assistantFavorite: SidebarFavoriteItem = { type: 'assistant', id: 'assistant-1' }

describe('sidebarVariants icons', () => {
  it('renders the assistant own emoji', () => {
    const ctx = createContext({
      installedAssistants: new Map([['assistant-1', createAssistant()]])
    })

    const entry = resolveSidebarEntry(assistantFavorite, ctx)
    render(<div data-testid="icon">{entry?.renderIcon(18, 'lg')}</div>)

    expect(screen.getByTestId('icon')).toHaveTextContent('🍒')
  })

  it('renders the model avatar when the icon type preference is model', () => {
    const ctx = createContext({
      assistantIconType: 'model',
      installedAssistants: new Map([['assistant-1', createAssistant()]])
    })

    const entry = resolveSidebarEntry(assistantFavorite, ctx)
    render(<div data-testid="icon">{entry?.renderIcon(18, 'lg')}</div>)

    // A pinned row must mirror the rail: with icon_type=model the rail shows the model
    // avatar, so showing the (often placeholder) emoji here would not match it.
    expect(screen.getByTestId('icon')).not.toHaveTextContent('🍒')
  })

  it('still renders a glyph when the icon type preference is none', () => {
    const ctx = createContext({
      assistantIconType: 'none',
      installedAssistants: new Map([['assistant-1', createAssistant()]])
    })

    const entry = resolveSidebarEntry(assistantFavorite, ctx)
    render(<div data-testid="icon">{entry?.renderIcon(18, 'lg')}</div>)

    // The rail can drop the icon entirely; a sidebar row cannot — it is the only thing
    // identifying the row.
    expect(screen.getByTestId('icon')).toHaveTextContent('🍒')
  })

  it('renders the rail placeholder icon when the assistant has no emoji', () => {
    const ctx = createContext({
      installedAssistants: new Map([['assistant-1', createAssistant({ emoji: '' })]])
    })

    const entry = resolveSidebarEntry(assistantFavorite, ctx)
    const { container } = render(<div data-testid="icon">{entry?.renderIcon(18, 'lg')}</div>)

    // Rendering an empty emoji would leave EmojiIcon showing only its blurred '⭐️'
    // placeholder; the shared renderer draws the same bot placeholder as the rail.
    expect(screen.getByTestId('icon')).not.toHaveTextContent('⭐️')
    expect(container.querySelector('svg')).not.toBeNull()
  })

  describe('onOpen and onOpenNewTab actions', () => {
    it('wires openApp with and without inNewTab for app variant', () => {
      const openApp = vi.fn()
      const ctx = createContext({ openApp })
      const appFavorite: SidebarFavoriteItem = { type: 'app', id: 'assistants' }

      const entry = resolveSidebarEntry(appFavorite, ctx)
      expect(entry).not.toBeNull()

      entry?.onOpen()
      expect(openApp).toHaveBeenCalledWith('assistants')

      entry?.onOpenNewTab?.()
      expect(openApp).toHaveBeenCalledWith('assistants', { inNewTab: true })
    })

    it('wires openAssistant with and without inNewTab for assistant variant', () => {
      const openAssistant = vi.fn()
      const ctx = createContext({
        openAssistant,
        installedAssistants: new Map([['assistant-1', createAssistant()]])
      })

      const entry = resolveSidebarEntry(assistantFavorite, ctx)
      expect(entry).not.toBeNull()

      entry?.onOpen()
      expect(openAssistant).toHaveBeenCalledWith('assistant-1')

      entry?.onOpenNewTab?.()
      expect(openAssistant).toHaveBeenCalledWith('assistant-1', { inNewTab: true })
    })
  })
})
