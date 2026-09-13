import type { WindowApiType } from '../../../src/preload/preload'
import { expect, test } from '../fixtures/electron.fixture'
import { dataRequest } from '../utils/ipc'
import { uiLocator } from '../utils/ui-locator'

test.use({ extraElectronArgs: ['--js-flags=--max-old-space-size=512'] })

test('cache inspection preserves large legacy records and stays usable when reopened', async ({
  electronApp,
  mainWindow
}) => {
  const heapLimit = await mainWindow.evaluate(
    () => (performance as Performance & { memory: { jsHeapSizeLimit: number } }).memory.jsHeapSizeLimit
  )
  expect(heapLimit).toBeLessThan(1024 ** 3)
  const payloadBytes = 32 * 1024 * 1024
  const topic = await dataRequest<{ id: string }>(mainWindow, 'POST', '/topics', { name: 'Retained conversation' })
  const parts = [{ type: 'text', text: 'Keep this conversation when inspecting cache.' }]
  const message = await dataRequest<{ id: string }>(mainWindow, 'POST', `/topics/${topic.id}/messages`, {
    role: 'user',
    data: { parts }
  })
  await mainWindow.evaluate(async (bytes) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('CherryStudio', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const payload = new Uint8Array(bytes)
        payload[0] = 17
        payload[bytes - 1] = 239
        const transaction = db.transaction('files', 'readwrite')
        transaction.objectStore('files').put({ id: 'large-file', payload })
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error)
      })
    } finally {
      db.close()
    }
    // Seed only after startup so the v1 marker cannot trigger the migration gate.
    localStorage.setItem('persist:cherry-studio', '{}')
    await (window as unknown as { api: WindowApiType }).api.preference.set('app.user.name', 'Cache inspection fixture')
  }, payloadBytes)

  let reloads = 0
  let crashes = 0
  mainWindow.on('domcontentloaded', () => reloads++)
  mainWindow.on('crash', () => crashes++)
  await mainWindow.getByRole('button', { name: 'Settings', exact: true }).click()
  await uiLocator(mainWindow, 'settings.navigation').getByText('Data', { exact: true }).click()
  const openCleanup = uiLocator(mainWindow, 'settings.content').getByRole('button', {
    name: 'Clear Cache',
    exact: true
  })

  for (let attempt = 0; attempt < 3; attempt++) {
    await openCleanup.click()
    const dialog = mainWindow.getByRole('dialog', { name: 'Clear Cache', exact: true })
    await expect(dialog.getByText('Leftover data from v1', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Calculating…', { exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('checkbox', { name: /Leftover data from v1/ })).not.toHaveAccessibleName(
      /Unable to calculate/
    )
    await expect(dialog.getByRole('button', { name: 'Clear Cache', exact: true })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
  }

  expect(reloads).toBe(0)
  expect(crashes).toBe(0)
  expect(electronApp.process().exitCode).toBeNull()
  expect(await dataRequest(mainWindow, 'GET', `/messages/${message.id}`)).toMatchObject({
    topicId: topic.id,
    data: { parts }
  })
  const retained = await mainWindow.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('CherryStudio')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const record = await new Promise<{ bytes: number; first: number; last: number | undefined } | null>(
        (resolve, reject) => {
          const request = db.transaction('files').objectStore('files').get('large-file')
          request.onsuccess = () => {
            const stored = request.result as { payload: Uint8Array } | undefined
            resolve(
              stored
                ? { bytes: stored.payload.byteLength, first: stored.payload[0], last: stored.payload.at(-1) }
                : null
            )
          }
          request.onerror = () => reject(request.error)
        }
      )
      return {
        record,
        marker: localStorage.getItem('persist:cherry-studio'),
        userName: await (window as unknown as { api: WindowApiType }).api.preference.get('app.user.name')
      }
    } finally {
      db.close()
    }
  })
  expect(retained).toEqual({
    record: { bytes: payloadBytes, first: 17, last: 239 },
    marker: '{}',
    userName: 'Cache inspection fixture'
  })
})
