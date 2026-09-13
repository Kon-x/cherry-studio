import type { WindowApiType } from '../../../src/preload/preload'
import type { Assistant } from '../../../src/shared/data/types/assistant'
import type { Model } from '../../../src/shared/data/types/model'
import { dataRequest } from '../utils/ipc'
import { test as base } from './electron.fixture'
import { startLocalServer } from './local-server'

type ChatFixtures = {
  localServer: Awaited<ReturnType<typeof startLocalServer>>
  models: { chat: Model; embedding: Model; assistant: Assistant }
}

export const test = base.extend<ChatFixtures>({
  localServer: async ({}, use) => {
    const server = await startLocalServer()
    try {
      await use(server)
    } finally {
      await server.close()
    }
  },
  models: async ({ mainWindow, localServer }, use) => {
    await dataRequest(mainWindow, 'POST', '/providers', {
      providerId: 'e2e-local',
      name: 'Local verification',
      defaultChatEndpoint: 'openai-chat-completions',
      endpointConfigs: {
        'openai-chat-completions': { baseUrl: `${localServer.url}/v1` },
        'openai-embeddings': { baseUrl: `${localServer.url}/v1` }
      },
      authConfig: { type: 'api-key', required: false }
    })
    await dataRequest(mainWindow, 'PATCH', '/providers/e2e-local', { isEnabled: true })
    const [chat, embedding] = await dataRequest<Model[]>(mainWindow, 'POST', '/models', [
      {
        providerId: 'e2e-local',
        modelId: 'e2e-chat',
        name: 'E2E Chat',
        capabilities: ['function-call'],
        endpointTypes: ['openai-chat-completions'],
        supportsStreaming: true,
        contextWindow: 32768
      },
      {
        providerId: 'e2e-local',
        modelId: 'e2e-embedding',
        name: 'E2E Embedding',
        capabilities: ['embedding'],
        endpointTypes: ['openai-embeddings']
      }
    ])
    const { items: assistants } = await dataRequest<{ items: Assistant[] }>(mainWindow, 'GET', '/assistants')
    const assistant = await dataRequest<Assistant>(mainWindow, 'PATCH', `/assistants/${assistants[0].id}`, {
      modelId: chat.id
    })
    await mainWindow.evaluate(async (modelId) => {
      await (window as unknown as { api: WindowApiType }).api.preference.set('chat.default_model_id', modelId)
    }, chat.id)
    await use({ chat, embedding, assistant })
  }
})

export { expect } from '@playwright/test'
