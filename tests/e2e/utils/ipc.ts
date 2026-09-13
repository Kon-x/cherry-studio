import { randomUUID } from 'node:crypto'

import type { Page } from '@playwright/test'

import type { WindowApiType } from '../../../src/preload/preload'
import type { DataResponse, HttpMethod } from '../../../src/shared/data/api/types'
import type { IpcResult } from '../../../src/shared/ipc/errors/IpcError'

export async function dataRequest<T>(page: Page, method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const response: DataResponse<T> = await page.evaluate(
    (request) => (window as unknown as { api: WindowApiType }).api.dataApi.request(request),
    { id: randomUUID(), method, path, body }
  )
  if (response.status >= 400) throw new Error(`${method} ${path}: ${JSON.stringify(response.error)}`)
  return response.data as T
}

export async function ipcRequest<T>(page: Page, route: string, input?: unknown): Promise<T> {
  const result = (await page.evaluate(
    ({ route, input }) => (window as unknown as { api: WindowApiType }).api.ipcApi.request(route, input),
    { route, input }
  )) as IpcResult<T>
  if (!result.ok) throw new Error(`${route}: ${JSON.stringify(result.error)}`)
  return result.data
}
