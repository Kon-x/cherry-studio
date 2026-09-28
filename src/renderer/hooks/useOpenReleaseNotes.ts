import { useCallback } from 'react'

import { ipcApi } from '@renderer/ipc'

export function useOpenReleaseNotes() {
  return useCallback(
    () => ipcApi.request('system.shell.open_website', 'https://github.com/Kon-x/cherry-studio/releases'),
    []
  )
}
