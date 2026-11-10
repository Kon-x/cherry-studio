import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SelectionAction } from '@shared/types/selection'

import SelectionToolbarView from '../SelectionToolbarView'

vi.mock('@renderer/assets/images/logo.png', () => ({ default: 'logo.png' }))

describe('SelectionToolbarView surface', () => {
  it('uses an opaque card as the default toolbar background', () => {
    const { container } = render(
      <SelectionToolbarView
        actionItems={[]}
        isCompact={false}
        handleAction={vi.fn()}
        copyIconStatus="normal"
        copyIconAnimation="none"
      />
    )

    expect(container.firstElementChild?.className).toContain('bg-card')
    expect(container.firstElementChild?.className).not.toContain('rgb(245_245_245_/_0.95)')
    expect(container.firstElementChild?.className).not.toContain('rgb(20_20_20_/_0.95)')
  })
})

describe('SelectionToolbarView unavailable actions', () => {
  const ACTIONS: SelectionAction[] = [
    { id: 'translate', name: 'Translate', enabled: true, isBuiltIn: true },
    { id: 'summary', name: 'Summary', enabled: true, isBuiltIn: true }
  ]

  it.each([false, true])('ignores clicks and exposes the reason (compact: %s)', (isCompact) => {
    const handleAction = vi.fn()
    render(
      <SelectionToolbarView
        actionItems={ACTIONS}
        isCompact={isCompact}
        handleAction={handleAction}
        copyIconStatus="normal"
        copyIconAnimation="none"
        unavailableReasons={{ translate: 'No model set' }}
      />
    )

    const translate = screen.getByRole('button', { name: 'Translate' })
    expect(translate).toHaveAttribute('aria-disabled', 'true')
    expect(translate).toHaveAttribute('aria-description', 'No model set')
    fireEvent.click(translate)
    expect(handleAction).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Summary' }))
    expect(handleAction).toHaveBeenCalledWith(ACTIONS[1])
  })
})
