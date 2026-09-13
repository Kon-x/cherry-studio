import { ipcApi } from '@renderer/ipc'
import { useCallback } from 'react'

export function useOpenReleaseNotes() {
  return useCallback(
    () => ipcApi.request('system.shell.open_website', 'https://github.com/Kon-x/cherry-studio/releases'),
    []
  )
}
