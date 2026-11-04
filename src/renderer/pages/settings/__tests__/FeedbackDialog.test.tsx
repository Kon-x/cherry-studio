import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import '@testing-library/jest-dom/vitest'
import { beforeAll } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import enUs from '@renderer/i18n/locales/en-us.json'

const mocks = vi.hoisted(() => ({
  ipcRequest: vi.fn(),
  loggerError: vi.fn(),
  openRoute: vi.fn(),
  showDoctor: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('@logger', () => ({
  loggerService: { withContext: () => ({ error: mocks.loggerError }) }
}))

vi.mock('@renderer/ipc', () => ({
  ipcApi: {
    request: (...args: unknown[]) => mocks.ipcRequest(...args)
  }
}))

vi.mock('@renderer/components/doctor', () => ({
  DoctorPopup: { show: (...args: unknown[]) => mocks.showDoctor(...args) }
}))

vi.mock('@renderer/services/mainWindowNavigation', () => ({
  openRoute: (...args: unknown[]) => mocks.openRoute(...args)
}))

vi.mock('@renderer/services/toast', () => ({
  toast: { error: (...args: unknown[]) => mocks.toastError(...args) }
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (enUs as Record<string, string>)[key] ?? key
  })
}))

vi.mock('@renderer/components/doctor', () => ({
  DoctorPopup: { show: (...args: unknown[]) => mocks.showDoctor(...args) }
}))

import { FEEDBACK_GITHUB_URL, FeedbackDialog } from '../FeedbackDialog'

function ControlledFeedbackDialog() {
  const [open, setOpen] = useState(true)
  return <FeedbackDialog open={open} onOpenChange={setOpen} />
}

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

describe('FeedbackDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ipcRequest.mockResolvedValue({ sessionId: 'feedback-session' })
  })

  it('opens the one-step diagnostic upload dialog', async () => {
    render(<ControlledFeedbackDialog />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(enUs['settings.about.feedback.diagnostics.title']) }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.showDoctor).not.toHaveBeenCalled()

    await waitFor(() => expect(mocks.showDoctor).toHaveBeenCalledWith({ initialPanel: 'report' }))
  })

  it('opens the GitHub issue chooser', async () => {
    render(<FeedbackDialog open onOpenChange={vi.fn()} />)

    await userEvent.setup().click(screen.getByRole('button', { name: /GitHub Issue/ }))

    await waitFor(() =>
      expect(mocks.ipcRequest).toHaveBeenCalledWith('system.shell.open_external_website', FEEDBACK_GITHUB_URL)
    )
  })

  it('closes before reporting GitHub issue chooser failures', async () => {
    mocks.ipcRequest.mockImplementation((route: string) => {
      if (route === 'system.shell.open_external_website') {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        return Promise.reject(new Error('open failed'))
      }
      return Promise.resolve({ sessionId: 'feedback-session' })
    })
    render(<ControlledFeedbackDialog />)

    await userEvent.setup().click(screen.getByRole('button', { name: /GitHub Issue/ }))

    await waitFor(() =>
      expect(mocks.loggerError).toHaveBeenCalledWith('Failed to open GitHub issue chooser', expect.any(Error))
    )
    expect(mocks.toastError).toHaveBeenCalledWith(enUs['settings.about.feedback.github.error'])
  })
})
