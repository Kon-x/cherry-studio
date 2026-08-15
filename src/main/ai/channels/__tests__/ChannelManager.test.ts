import { describe, expect, it, vi } from 'vitest'

import { ChannelManager } from '../ChannelManager'

vi.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), silly: vi.fn() })
  }
}))

// Fork contract: the channels feature was removed — the inert manager must keep
// its consumers' call surface working while never producing an adapter.
describe('ChannelManager (inert fork stub)', () => {
  const channelManager = new ChannelManager()

  it('start()/syncChannel() never surface adapters or throw', async () => {
    await expect(channelManager.start()).resolves.not.toThrow()
    await expect(channelManager.syncChannel('ch-1', { awaitConnect: true })).resolves.not.toThrow()

    expect(channelManager.getAdapter('ch-1')).toBeUndefined()
    expect(channelManager.getAgentAdapters('agent-1')).toEqual([])
    expect(channelManager.getAdapterStatuses('agent-1')).toEqual([])
    expect(channelManager.getAllStatuses()).toEqual([])
    expect(channelManager.getChannelLogs('ch-1')).toEqual([])
  })

  it('quiesce surface stays callable for the backup-restore flow', async () => {
    const pause = channelManager.pause('restore')
    expect(() => pause.dispose()).not.toThrow()
    await expect(channelManager.drainInFlight({ timeoutMs: 100 })).resolves.toEqual({ stragglerIds: [] })
    expect(channelManager.listActiveWork()).toEqual([])
  })

  it('QR login is refused', async () => {
    await expect(channelManager.waitForQrUrl('agent-1', 'ch-1', 10)).rejects.toThrow(/removed/)
  })
})
