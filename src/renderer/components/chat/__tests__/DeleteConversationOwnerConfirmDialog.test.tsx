// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { mockPreferenceState } from '@test-mocks/renderer/PreferenceService'
import { mockUsePreference, MockUsePreferenceUtils } from '@test-mocks/renderer/usePreference'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as CherryStudioUi from '@cherrystudio/ui'
import { PopupHost } from '@renderer/components/PopupHost'
import i18n from '@renderer/i18n/resolver'
import { POPUP_EXIT_MS, popupService } from '@renderer/services/popup'
import { formatErrorMessage } from '@renderer/utils/error'

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))

vi.mock('@cherrystudio/ui', async (importOriginal) => importOriginal<typeof CherryStudioUi>())
vi.mock('@renderer/services/popup', async (importOriginal) => await importOriginal())
vi.mock('@renderer/services/toast', () => ({
  toast: { error: toastError }
}))

import {
  DeleteConversationOwnerConfirmDialog,
  deleteConversationOwnerPopup,
  PermanentConversationDeleteDialog,
  permanentDeletePopup
} from '../DeleteConversationOwnerConfirmDialog'

const preferenceKey = 'assistant.archive.related_topics'
const defaultPreferenceImplementation = mockUsePreference.getMockImplementation()!

beforeEach(async () => {
  mockUsePreference.mockImplementation(defaultPreferenceImplementation)
  MockUsePreferenceUtils.resetMocks()
  MockUsePreferenceUtils.setPreferenceValue(preferenceKey, false)
  await i18n.changeLanguage('en-US')
})

afterEach(() => {
  cleanup()
  vi.useFakeTimers()
  for (const entry of [...popupService.getSnapshot()]) {
    popupService.settle(entry.instanceId, false)
  }
  vi.advanceTimersByTime(POPUP_EXIT_MS)
  vi.useRealTimers()
  toastError.mockClear()
})

describe('DeleteConversationOwnerConfirmDialog', () => {
  it('labels the cascade choice as related topics for assistants', () => {
    render(
      <DeleteConversationOwnerConfirmDialog
        type="assistant"
        open
        pending={false}
        onOpenChange={() => {}}
        onConfirm={() => {}}
      />
    )

    expect(
      screen.getByRole('checkbox', {
        name: 'Also archive related topics'
      })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', {
        name: 'Also archive related sessions'
      })
    ).not.toBeInTheDocument()
  })

  it('remembers assistant choices in both directions and saves changes even when canceled', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const props = {
      type: 'assistant' as const,
      open: true,
      pending: false,
      onOpenChange: vi.fn(),
      onConfirm
    }
    const first = render(<DeleteConversationOwnerConfirmDialog key="assistant-1" {...props} />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()

    await user.click(screen.getByRole('checkbox'))
    first.rerender(<DeleteConversationOwnerConfirmDialog key="assistant-1" {...props} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Archive' }))
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(true)
    first.unmount()

    const second = render(<DeleteConversationOwnerConfirmDialog key="assistant-2" {...props} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
    await user.click(screen.getByRole('checkbox'))
    second.rerender(<DeleteConversationOwnerConfirmDialog key="assistant-2" {...props} />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Archive' }))
    expect(onConfirm).toHaveBeenNthCalledWith(2, false)
    second.unmount()

    onConfirm.mockClear()
    const third = render(<DeleteConversationOwnerConfirmDialog key="assistant-3" {...props} />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    await user.click(screen.getByRole('checkbox'))
    third.rerender(<DeleteConversationOwnerConfirmDialog key="assistant-3" {...props} />)
    expect(mockPreferenceState.get(preferenceKey)).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).not.toHaveBeenCalled()
    third.unmount()

    const fourth = render(<DeleteConversationOwnerConfirmDialog key="assistant-4" {...props} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
    await user.click(screen.getByRole('checkbox'))
    fourth.rerender(<DeleteConversationOwnerConfirmDialog key="assistant-4" {...props} />)
    expect(mockPreferenceState.get(preferenceKey)).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).not.toHaveBeenCalled()
    fourth.unmount()

    render(<DeleteConversationOwnerConfirmDialog key="assistant-5" {...props} />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('follows changed hook values in an already-open assistant dialog', async () => {
    const user = userEvent.setup()
    const setter = vi.fn().mockResolvedValue(undefined)
    const props = {
      type: 'assistant' as const,
      open: true,
      pending: false,
      onOpenChange: vi.fn(),
      onConfirm: vi.fn()
    }
    MockUsePreferenceUtils.mockPreferenceReturn(preferenceKey, false, setter)
    const { rerender } = render(<DeleteConversationOwnerConfirmDialog {...props} />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()

    MockUsePreferenceUtils.mockPreferenceReturn(preferenceKey, true, setter)
    rerender(<DeleteConversationOwnerConfirmDialog {...props} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Archive' }))
    expect(props.onConfirm).toHaveBeenCalledExactlyOnceWith(true)

    MockUsePreferenceUtils.mockPreferenceReturn(preferenceKey, false, setter)
    rerender(<DeleteConversationOwnerConfirmDialog {...props} />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Archive' }))
    expect(props.onConfirm).toHaveBeenNthCalledWith(2, false)
  })

  it('consumes a rejected preference write and keeps the assistant dialog usable', async () => {
    const user = userEvent.setup()
    const error = new Error('write failed')
    MockUsePreferenceUtils.mockPreferenceError(preferenceKey, error)
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <DeleteConversationOwnerConfirmDialog
        type="assistant"
        open
        pending={false}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    )

    await user.click(screen.getByRole('checkbox'))
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith({
        title: i18n.t('common.error'),
        description: formatErrorMessage(error)
      })
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeEnabled()
    expect(onConfirm).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('blocks every dismissal path while deletion is pending', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn()

    render(
      <DeleteConversationOwnerConfirmDialog
        type="assistant"
        open
        pending
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    )

    const checkbox = screen.getByRole('checkbox', {
      name: 'Also archive related topics'
    })
    expect(checkbox).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled()
    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    expect(cancelButton).toBeDisabled()

    await user.click(cancelButton)
    await user.keyboard('{Escape}')

    // The Radix overlay has no semantic role; data-slot is the maintained primitive contract.
    const overlay = document.body.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')
    expect(overlay).not.toBeNull()
    fireEvent.click(overlay!)

    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('deleteConversationOwnerPopup', () => {
  it.each(['assistant'] as const)('requires explicit confirmation for archiving an %s', async (type) => {
    const user = userEvent.setup()
    const action = vi.fn()
    render(<PopupHost />)
    let result!: Promise<boolean>
    act(() => {
      result = deleteConversationOwnerPopup.show({ type, action })
    })
    const checkbox = await screen.findByRole('checkbox')
    expect(checkbox).not.toBeChecked()
    expect(checkbox).toHaveAccessibleName(/Also archive related/)
    expect(screen.queryByRole('button', { name: 'Delete Permanently' })).not.toBeInTheDocument()
    expect(action).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await expect(result).resolves.toBe(false)
    expect(action).not.toHaveBeenCalled()
  })

  it('preserves the remembered assistant cascade when confirming the popup', async () => {
    const user = userEvent.setup()
    MockUsePreferenceUtils.setPreferenceValue(preferenceKey, true)
    const action = vi.fn()
    render(<PopupHost />)
    let result!: Promise<boolean>
    act(() => {
      result = deleteConversationOwnerPopup.show({ type: 'assistant', action })
    })
    expect(await screen.findByRole('checkbox')).toBeChecked()
    expect(action).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Archive' }))
    await expect(result).resolves.toBe(true)
    expect(action).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('shows an error, stays open, and resolves true after retrying the same single-flight popup', async () => {
    const user = userEvent.setup()
    const error = new Error('delete failed')
    const action = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined)
    const ignoredAction = vi.fn()
    render(<PopupHost />)

    let result!: Promise<boolean>
    let duplicate!: Promise<boolean>
    act(() => {
      result = deleteConversationOwnerPopup.show({ type: 'assistant', action })
      duplicate = deleteConversationOwnerPopup.show({ type: 'assistant', action: ignoredAction })
    })
    expect(duplicate).toBe(result)

    await user.click(await screen.findByRole('button', { name: 'Archive' }))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith({
        title: i18n.t('common.error'),
        description: formatErrorMessage(error)
      })
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(ignoredAction).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Archive' }))

    expect(action).toHaveBeenCalledTimes(2)
    await expect(result).resolves.toBe(true)
  })
})

describe('permanent deletion confirmation', () => {
  it('names the assistant and states what is deleted and kept before confirm', async () => {
    const action = vi.fn()

    render(
      <DeleteConversationOwnerConfirmDialog
        mode="permanent"
        type="assistant"
        name="Field Notes"
        open
        pending={false}
        onOpenChange={() => {}}
        onConfirm={action}
      />
    )

    expect(screen.getByRole('dialog', { name: 'Permanently delete assistant "Field Notes"?' })).toBeInTheDocument()
    expect(screen.getByText(/Knowledge bases and MCP servers themselves are kept/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Delete Permanently' })).toHaveAttribute('data-variant', 'destructive')
    expect(
      screen.getByRole('checkbox', {
        name: 'Also permanently delete all of its topics, including archived and pinned ones'
      })
    ).not.toBeChecked()
    expect(screen.getByText('Its topics are kept and move to Unlinked Assistant.')).toBeInTheDocument()
    expect(action).not.toHaveBeenCalled()
  })

  it('submits the unchecked owner cascade by default and the checked cascade after an explicit choice', async () => {
    const user = userEvent.setup()
    const unchecked = vi.fn()
    const checked = vi.fn()
    const { rerender } = render(
      <DeleteConversationOwnerConfirmDialog
        mode="permanent"
        type="assistant"
        name="Dispatch"
        open
        pending={false}
        onOpenChange={() => {}}
        onConfirm={unchecked}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Delete Permanently' }))
    expect(unchecked).toHaveBeenCalledExactlyOnceWith(false)

    rerender(
      <DeleteConversationOwnerConfirmDialog
        mode="permanent"
        type="assistant"
        name="Dispatch"
        open
        pending={false}
        onOpenChange={() => {}}
        onConfirm={checked}
      />
    )
    expect(screen.getByRole('dialog', { name: 'Permanently delete assistant "Dispatch"?' })).toBeInTheDocument()
    expect(screen.getByText('Its topics are kept and move to Unlinked Assistant.')).toBeInTheDocument()
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Also permanently delete all of its topics, including archived and pinned ones'
      })
    )
    expect(screen.queryByText('Its topics are kept and move to Unlinked Assistant.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete Permanently' }))
    expect(checked).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('blocks confirm and dismissal while a permanent owner delete is pending', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn()

    render(
      <DeleteConversationOwnerConfirmDialog
        mode="permanent"
        type="assistant"
        name="Dispatch"
        open
        pending
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByRole('button', { name: 'Delete Permanently' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Delete Permanently' }))
    await user.keyboard('{Escape}')
    fireEvent.click(document.body.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')!)

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('confirms a topic by name with no cascade checkbox', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <PermanentConversationDeleteDialog
        target="topic"
        name="Notes"
        open
        pending={false}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByRole('dialog', { name: 'Permanently delete "Notes"?' })).toBeInTheDocument()
    expect(screen.getByText(/This topic and all of its messages will be permanently deleted/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not delete a conversation until the permanent action is confirmed', async () => {
    const user = userEvent.setup()
    const action = vi.fn()
    render(<PopupHost />)

    let result!: Promise<boolean>
    act(() => {
      result = permanentDeletePopup.show({ kind: 'conversation', target: 'topic', name: 'Notes', action })
    })

    expect(await screen.findByRole('dialog', { name: 'Permanently delete "Notes"?' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(action).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await expect(result).resolves.toBe(false)
    expect(action).not.toHaveBeenCalled()
  })

  it('runs the conversation action once when permanent delete is confirmed', async () => {
    const user = userEvent.setup()
    const action = vi.fn()
    render(<PopupHost />)

    let result!: Promise<boolean>
    act(() => {
      result = permanentDeletePopup.show({ kind: 'conversation', target: 'topic', name: 'Notes', action })
    })

    await user.click(await screen.findByRole('button', { name: 'Delete Permanently' }))
    await expect(result).resolves.toBe(true)
    expect(action).toHaveBeenCalledOnce()
  })

  it('keeps a second permanent-delete request on the same open confirmation', async () => {
    const user = userEvent.setup()
    const action = vi.fn()
    const ignored = vi.fn()
    render(<PopupHost />)

    let result!: Promise<boolean>
    let duplicate!: Promise<boolean>
    act(() => {
      result = permanentDeletePopup.show({ kind: 'conversation', target: 'topic', name: 'Notes', action })
      duplicate = permanentDeletePopup.show({
        kind: 'owner',
        type: 'assistant',
        name: 'Dispatch',
        action: ignored
      })
    })
    expect(duplicate).toBe(result)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await expect(result).resolves.toBe(false)
    expect(action).not.toHaveBeenCalled()
    expect(ignored).not.toHaveBeenCalled()
  })

  it('submits one owner cascade when confirm is activated again before pending renders', async () => {
    let finish!: () => void
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    render(<PopupHost />)

    let result!: Promise<boolean>
    act(() => {
      result = permanentDeletePopup.show({ kind: 'owner', type: 'assistant', name: 'Field Notes', action })
    })

    const confirm = await screen.findByRole('button', { name: 'Delete Permanently' })
    expect(action).not.toHaveBeenCalled()
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(action).toHaveBeenCalledExactlyOnceWith(false)

    finish()
    await expect(result).resolves.toBe(true)
    expect(action).toHaveBeenCalledOnce()
  })

  it('stays open when a permanent delete fails and completes on a later confirm', async () => {
    const user = userEvent.setup()
    const error = new Error('delete failed')
    const action = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined)
    render(<PopupHost />)

    let result!: Promise<boolean>
    act(() => {
      result = permanentDeletePopup.show({ kind: 'conversation', target: 'topic', name: 'Notes', action })
    })

    await user.click(await screen.findByRole('button', { name: 'Delete Permanently' }))
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith({
        title: i18n.t('common.error'),
        description: formatErrorMessage(error)
      })
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(action).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Delete Permanently' }))
    await expect(result).resolves.toBe(true)
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('dismisses on the first Cancel after a failed confirm without deleting again', async () => {
    const user = userEvent.setup()
    const error = new Error('delete failed')
    const action = vi.fn().mockRejectedValue(error)
    render(<PopupHost />)

    let result!: Promise<boolean>
    act(() => {
      result = permanentDeletePopup.show({ kind: 'conversation', target: 'topic', name: 'Notes', action })
    })

    await user.click(await screen.findByRole('button', { name: 'Delete Permanently' }))
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith({
        title: i18n.t('common.error'),
        description: formatErrorMessage(error)
      })
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(action).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await expect(result).resolves.toBe(false)
    expect(action).toHaveBeenCalledOnce()
  })
})
