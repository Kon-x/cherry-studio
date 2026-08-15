import { agentChannelService as channelService } from '@data/services/AgentChannelService'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChannelAdapter, type ChannelAdapterConfig } from '../ChannelAdapter'
import { ChannelManager, registerAdapterFactory } from '../ChannelManager'

const channelManager = new ChannelManager()

vi.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), silly: vi.fn() })
  }
}))

vi.mock('@main/services/MainWindowService', () => ({
  windowService: {
    getMainWindow: vi.fn().mockReturnValue(null)
  }
}))

vi.mock('@data/services/AgentChannelService', () => ({
  agentChannelService: {
    listChannels: vi.fn().mockReturnValue([]),
    getChannel: vi.fn(),
    updateChannel: vi.fn()
  }
}))

vi.mock('../ChannelMessageHandler', () => ({
  channelMessageHandler: {
    handleIncoming: vi.fn(),
    handleCommand: vi.fn(),
    clearSessionTracker: vi.fn()
  }
}))

class MockAdapter extends ChannelAdapter {
  connect = vi.fn().mockResolvedValue(undefined)
  disconnect = vi.fn().mockResolvedValue(undefined)
  sendMessage = vi.fn().mockResolvedValue(undefined)
  sendTypingIndicator = vi.fn().mockResolvedValue(undefined)

  protected async performConnect(): Promise<void> {}
  protected async performDisconnect(): Promise<void> {}

  constructor(config: ChannelAdapterConfig) {
    super(config)
  }
}

// Track adapters created by the factory
let createdAdapters: MockAdapter[] = []

describe('ChannelManager', () => {
  beforeEach(async () => {
    // Defensively stop any leftover adapters from a previous failed test
    await channelManager.stop()
    vi.clearAllMocks()
    createdAdapters = []
    // Re-register the mock factory (the map persists across tests since we don't resetModules)
    registerAdapterFactory('telegram', (channel, agentId) => {
      const adapter = new MockAdapter({
        channelId: channel.id,
        channelType: channel.type,
        agentId,
        channelConfig: channel.config
      })
      createdAdapters.push(adapter)
      return adapter
    })
  })

  afterEach(async () => {
    await channelManager.stop()
  })

  const makeChannelRow = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'ch-1',
      type: 'telegram',
      name: 'Test',
      agentId: 'agent-1',
      sessionId: null,
      config: { bot_token: 'tok', allowed_chat_ids: [] },
      isActive: true,
      permissionMode: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides
    }) as any

  // Fork contract: the channels feature is disabled — no path may create or
  // connect an adapter, even for rows that are active and agent-bound.

  it('start() never connects adapters, even for active channels', async () => {
    vi.mocked(channelService.listChannels).mockReturnValue([makeChannelRow()])

    await expect(channelManager.start()).resolves.not.toThrow()

    expect(createdAdapters).toHaveLength(0)
    expect(channelManager.getAllStatuses()).toEqual([])
  })

  it('syncChannel() never reconnects an active channel', async () => {
    vi.mocked(channelService.getChannel).mockReturnValue(makeChannelRow())

    await channelManager.syncChannel('ch-1')

    expect(createdAdapters).toHaveLength(0)
  })
})
