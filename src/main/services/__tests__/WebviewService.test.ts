import { BaseService } from '@main/core/lifecycle'
import { getAppLanguage } from '@main/i18n'
import { session } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WebviewService } from '../WebviewService'

vi.mock('@main/i18n', () => ({ getAppLanguage: vi.fn(() => 'en-US') }))

describe('provider login session', () => {
  let service: WebviewService
  let headersHandler:
    | ((
        details: { url: string; requestHeaders: Record<string, string> },
        callback: (result: { requestHeaders: Record<string, string> }) => void
      ) => void)
    | null
  const originUA = 'Mozilla/5.0 CherryStudio/2.0 Electron/41.0 Safari/537'
  let userAgent: string

  beforeEach(async () => {
    BaseService.resetInstances()
    userAgent = originUA
    headersHandler = null
    vi.mocked(session.fromPartition).mockImplementation((partition) => {
      expect(partition).toBe('persist:webview')
      return {
        getUserAgent: () => userAgent,
        setUserAgent: (value: string) => {
          userAgent = value
        },
        webRequest: {
          onBeforeSendHeaders: (handler: typeof headersHandler) => {
            headersHandler = handler
          }
        }
      } as unknown as ReturnType<typeof session.fromPartition>
    })
    service = new WebviewService()
    await service._doInit()
  })

  afterEach(async () => {
    await service._doStop()
  })

  it('keeps provider login UA and request-time language configuration', () => {
    expect(userAgent).toBe('Mozilla/5.0 Safari/537')
    vi.mocked(getAppLanguage).mockReturnValue('zh-CN')
    const result = { requestHeaders: {} as Record<string, string> }
    headersHandler!({ url: 'https://provider.example/login', requestHeaders: { Authorization: 'test' } }, (value) => {
      result.requestHeaders = value.requestHeaders
    })
    expect(result.requestHeaders).toEqual({
      Authorization: 'test',
      'User-Agent': 'Mozilla/5.0 Safari/537',
      'Accept-Language': 'zh-CN, en;q=0.9, *;q=0.5'
    })
    headersHandler!({ url: 'https://accounts.google.com/login', requestHeaders: {} }, (value) => {
      result.requestHeaders = value.requestHeaders
    })
    expect(result.requestHeaders['User-Agent']).toBe(originUA)
  })

  it('releases its request interceptor when the lifecycle stops', async () => {
    await service._doStop()
    expect(headersHandler).toBeNull()
  })
})
