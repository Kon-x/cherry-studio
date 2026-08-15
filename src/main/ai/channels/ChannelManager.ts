import { loggerService } from '@logger'
import { BaseService, type Disposable, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'

import type { ChannelAdapter } from './ChannelAdapter'
import type { ChannelLogEntry, ChannelStatusEvent } from './types'

const logger = loggerService.withContext('ChannelManager')

/**
 * Fork: the channels feature (Telegram / Feishu / Discord / … bot adapters) was
 * physically removed. This inert manager keeps the service surface its consumers
 * compile against — agent autonomy tools, scheduled-task delivery, backup
 * quiesce, and the channel workflow service — while never owning an adapter.
 */
@Injectable('ChannelManager')
@ServicePhase(Phase.WhenReady)
export class ChannelManager extends BaseService {
  protected async onReady(): Promise<void> {
    logger.info('Channel manager disabled in this fork — the adapter machinery was removed')
  }

  protected async onStop(): Promise<void> {}

  /** Backup-restore quiesce: nothing to pause. */
  pause(_reason?: string): Disposable {
    return { dispose: () => {} }
  }

  async drainInFlight(_opts: { timeoutMs: number }): Promise<{ stragglerIds: string[] }> {
    return { stragglerIds: [] }
  }

  listActiveWork(): Array<{ id: string; summary: string }> {
    return []
  }

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  async syncChannel(
    _channelId: string,
    _options: { awaitConnect?: boolean; strictDisconnect?: boolean } = {}
  ): Promise<void> {}

  async disconnectChannel(_channelId: string, _options: { suppressErrors?: boolean } = {}): Promise<void> {}

  async disconnectAgent(_agentId: string): Promise<void> {}

  waitForQrUrl(_agentId: string, _channelId: string, _timeoutMs = 30_000): Promise<string> {
    return Promise.reject(new Error('Channels were removed from this build'))
  }

  getAdapterStatuses(_agentId: string): Array<{ channelId: string; connected: boolean }> {
    return []
  }

  getAgentAdapters(_agentId: string): ChannelAdapter[] {
    return []
  }

  getAdapter(_channelId: string): ChannelAdapter | undefined {
    return undefined
  }

  getChannelLogs(_channelId: string): ChannelLogEntry[] {
    return []
  }

  getAllStatuses(): ChannelStatusEvent[] {
    return []
  }
}
