import { ipcApi } from '@renderer/ipc'
import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { useOpenReleaseNotes } from '../useOpenReleaseNotes'

vi.mock('@renderer/ipc', () => ({ ipcApi: { request: vi.fn().mockResolvedValue(undefined) } }))

it('opens fork release notes in the system browser', async () => {
  const { result } = renderHook(useOpenReleaseNotes)
  await act(async () => {
    await result.current()
  })
  expect(ipcApi.request).toHaveBeenCalledWith(
    'system.shell.open_website',
    'https://github.com/Kon-x/cherry-studio/releases'
  )
})
