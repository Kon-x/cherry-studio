import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dexieMock = vi.hoisted(() => ({
  exists: vi.fn()
}))

const storageMock = vi.hoisted(() => ({
  databases: vi.fn(),
  estimate: vi.fn()
}))

vi.mock('dexie', () => ({
  Dexie: class MockDexie {
    static exists = dexieMock.exists

    constructor() {
      throw new Error('Size inspection must not open legacy records')
    }
  }
}))

import {
  beginLegacyV1Cleanup,
  clearLegacyV1BrowserData,
  finalizeLegacyV1Cleanup,
  hasLegacyV1Marker,
  inspectLegacyV1BrowserData,
  LEGACY_LOCAL_STORAGE_KEYS,
  mergeLegacyV1CleanupResults
} from '../legacyV1BrowserData'

function installDeleteDatabase() {
  const request = {
    error: null as DOMException | null,
    onsuccess: null as (() => void) | null,
    onblocked: null as (() => void) | null,
    onerror: null as (() => void) | null
  }
  const deleteDatabase = vi.fn(() => request)
  vi.stubGlobal('indexedDB', { deleteDatabase })
  return {
    block: () => request.onblocked?.(),
    deleteDatabase,
    fail: () => {
      request.error = new DOMException('delete failed')
      request.onerror?.()
    },
    succeed: () => request.onsuccess?.()
  }
}

describe('legacyV1BrowserData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    dexieMock.exists.mockResolvedValue(true)
    storageMock.databases.mockReset().mockResolvedValue([{ name: 'CherryStudio', version: 29 }])
    storageMock.estimate.mockReset().mockResolvedValue({
      usage: 8192,
      usageDetails: { indexedDB: 2048, caches: 4096 }
    })
    vi.stubGlobal('indexedDB', { databases: storageMock.databases })
    vi.stubGlobal('navigator', { storage: { estimate: storageMock.estimate } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses persisted v1 state or an incomplete cleanup as the visibility marker', () => {
    localStorage.setItem('language', 'zh-cn')
    expect(hasLegacyV1Marker()).toBe(false)

    localStorage.setItem('persist:cherry-studio', '')
    expect(hasLegacyV1Marker()).toBe(true)

    localStorage.removeItem('persist:cherry-studio')
    expect(beginLegacyV1Cleanup()).toBe(true)
    expect(hasLegacyV1Marker()).toBe(true)
  })

  it('reports a retry-marker write failure without throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })

    expect(beginLegacyV1Cleanup()).toBe(false)
  })

  it('estimates only legacy storage without opening database records', async () => {
    localStorage.setItem('language', '中文')
    localStorage.setItem('failed_favicon_https://example.com', 'active-v2-state')
    localStorage.setItem('cs_cache_persist', 'v2-cache')

    await expect(inspectLegacyV1BrowserData()).resolves.toEqual({
      bytes: 2062,
      accuracy: 'estimated',
      completeness: 'complete'
    })
    expect(localStorage.getItem('language')).toBe('中文')
    expect(localStorage.getItem('cs_cache_persist')).toBe('v2-cache')
  })

  it.each([{ databases: [] }, { databases: [{ name: 'other-database', version: 1 }] }])(
    'reports zero when the legacy database is absent: $databases',
    async ({ databases }) => {
      storageMock.databases.mockResolvedValue(databases)
      vi.stubGlobal('navigator', {})

      await expect(inspectLegacyV1BrowserData()).resolves.toEqual({
        bytes: 0,
        accuracy: 'estimated',
        completeness: 'complete'
      })
    }
  )

  it('treats omitted zero-usage storage types as empty', async () => {
    storageMock.estimate.mockResolvedValue({ usage: 4096, usageDetails: { caches: 4096 } })

    await expect(inspectLegacyV1BrowserData()).resolves.toEqual({
      bytes: 0,
      accuracy: 'estimated',
      completeness: 'complete'
    })
  })

  it('keeps known bytes without attributing other databases to legacy data', async () => {
    localStorage.setItem('language', '中文')
    storageMock.databases.mockResolvedValue([
      { name: 'CherryStudio', version: 29 },
      { name: 'other-database', version: 1 }
    ])

    await expect(inspectLegacyV1BrowserData()).resolves.toEqual({
      bytes: 14,
      accuracy: 'estimated',
      completeness: 'partial'
    })
  })

  it('reports unknown size when the storage breakdown is unavailable', async () => {
    storageMock.estimate.mockResolvedValue({ usage: 8192 })

    await expect(inspectLegacyV1BrowserData()).resolves.toEqual({
      bytes: null,
      accuracy: 'unavailable',
      completeness: 'partial'
    })
  })

  it('reports unknown size when the storage API is unavailable', async () => {
    vi.stubGlobal('navigator', {})

    await expect(inspectLegacyV1BrowserData()).resolves.toEqual({
      bytes: null,
      accuracy: 'unavailable',
      completeness: 'partial'
    })
  })

  it.each(['databases', 'estimate'] as const)('preserves known bytes when %s fails', async (operation) => {
    localStorage.setItem('language', '中文')
    storageMock[operation].mockRejectedValueOnce(new DOMException('storage denied', 'SecurityError'))

    await expect(inspectLegacyV1BrowserData()).resolves.toEqual({
      bytes: 14,
      accuracy: 'estimated',
      completeness: 'partial'
    })
  })

  it('rejects an inspection that was already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(inspectLegacyV1BrowserData(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it.each(['databases', 'estimate'] as const)('discards %s results after cancellation', async (operation) => {
    let finishQuery: ((value: unknown) => void) | undefined
    storageMock[operation].mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishQuery = resolve
        })
    )
    const controller = new AbortController()

    const inspection = inspectLegacyV1BrowserData(controller.signal)
    await vi.waitFor(() => expect(finishQuery).toBeTypeOf('function'))
    controller.abort()
    finishQuery?.(operation === 'databases' ? [{ name: 'CherryStudio' }] : { usageDetails: { indexedDB: 2048 } })

    await expect(inspection).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('deletes only the v1 keys and the CherryStudio database', async () => {
    for (const key of LEGACY_LOCAL_STORAGE_KEYS) {
      localStorage.setItem(key, `legacy-${key}`)
    }
    const failedFaviconKeys = ['failed_favicon_https://example.com', 'failed_favicon_app://miniapp']
    for (const key of failedFaviconKeys) {
      localStorage.setItem(key, 'true')
    }
    localStorage.setItem('cs_cache_persist', 'keep-cache')
    localStorage.setItem('modelscope_token', 'keep-token')
    localStorage.setItem('failed-favicon-unrelated', 'keep-unrelated')
    const deleteRequest = installDeleteDatabase()

    const cleanup = clearLegacyV1BrowserData()
    await vi.waitFor(() => expect(deleteRequest.deleteDatabase).toHaveBeenCalledWith('CherryStudio'))
    deleteRequest.succeed()
    const result = await cleanup

    expect(result).toEqual({ group: 'legacy_v1', status: 'cleared' })
    for (const key of LEGACY_LOCAL_STORAGE_KEYS) {
      expect(localStorage.getItem(key)).toBeNull()
    }
    for (const key of failedFaviconKeys) expect(localStorage.getItem(key)).toBe('true')
    expect(localStorage.getItem('cs_cache_persist')).toBe('keep-cache')
    expect(localStorage.getItem('modelscope_token')).toBe('keep-token')
    expect(localStorage.getItem('failed-favicon-unrelated')).toBe('keep-unrelated')
  })

  it('treats blocked as an intermediate event and waits for IndexedDB deletion success', async () => {
    localStorage.setItem('language', 'zh-cn')
    const deleteRequest = installDeleteDatabase()
    const onBlocked = vi.fn()
    let settled = false

    const cleanup = clearLegacyV1BrowserData(onBlocked).finally(() => {
      settled = true
    })
    await vi.waitFor(() => expect(deleteRequest.deleteDatabase).toHaveBeenCalledOnce())
    deleteRequest.block()
    await Promise.resolve()

    expect(onBlocked).toHaveBeenCalledOnce()
    expect(settled).toBe(false)
    expect(localStorage.getItem('language')).toBeNull()

    deleteRequest.succeed()
    await expect(cleanup).resolves.toEqual({ group: 'legacy_v1', status: 'cleared' })
  })

  it('waits through blocked and returns failed only after IndexedDB deletion errors', async () => {
    const deleteRequest = installDeleteDatabase()
    const onBlocked = vi.fn()

    const cleanup = clearLegacyV1BrowserData(onBlocked)
    await vi.waitFor(() => expect(deleteRequest.deleteDatabase).toHaveBeenCalledOnce())
    deleteRequest.block()
    deleteRequest.fail()

    expect(onBlocked).toHaveBeenCalledOnce()
    await expect(cleanup).resolves.toEqual({ group: 'legacy_v1', status: 'failed' })
  })

  it('merges browser and main-process v1 cleanup into one partial result', () => {
    const result = mergeLegacyV1CleanupResults(
      {
        group: 'legacy_v1',
        status: 'cleared'
      },
      {
        group: 'legacy_v1',
        status: 'partial'
      }
    )

    expect(result).toEqual({
      group: 'legacy_v1',
      status: 'partial'
    })
  })

  it('keeps the retry marker after a partial run and clears it after a successful retry', async () => {
    localStorage.setItem('persist:cherry-studio', 'legacy')
    beginLegacyV1Cleanup()
    const deleteRequest = installDeleteDatabase()

    const browserCleanup = clearLegacyV1BrowserData()
    await vi.waitFor(() => expect(deleteRequest.deleteDatabase).toHaveBeenCalledOnce())
    deleteRequest.succeed()
    const partialResult = finalizeLegacyV1Cleanup(
      mergeLegacyV1CleanupResults({ group: 'legacy_v1', status: 'failed' }, await browserCleanup)
    )

    expect(partialResult.status).toBe('partial')
    expect(localStorage.getItem('persist:cherry-studio')).toBeNull()
    expect(hasLegacyV1Marker()).toBe(true)

    dexieMock.exists.mockResolvedValue(false)
    const retryResult = finalizeLegacyV1Cleanup(
      mergeLegacyV1CleanupResults({ group: 'legacy_v1', status: 'not_found' }, await clearLegacyV1BrowserData())
    )

    expect(retryResult.status).toBe('not_found')
    expect(hasLegacyV1Marker()).toBe(false)
  })
})
