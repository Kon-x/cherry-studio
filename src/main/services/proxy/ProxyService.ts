import { application } from '@application'
import { loggerService } from '@logger'
import { createLatestReconciler } from '@main/core/concurrency/latestReconciler'
import { BaseService, DependsOn, type Disposable, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import type { ProxyMode, UnifiedPreferenceKeyType } from '@shared/data/preference/preferenceTypes'
import { HTML_ARTIFACT_PREVIEW_PARTITION } from '@shared/utils/htmlArtifact'
import type { ProxyConfig } from 'electron'
import { app, session } from 'electron'
import { getSystemProxy } from 'os-proxy-config'

import { networkInterfacesFingerprint } from './networkFingerprint'
import { NodeProxyController } from './NodeProxyController'
import type { ProxyRoutingSnapshot } from './proxyRouting'

const logger = loggerService.withContext('ProxyService')

/**
 * How often the external network interfaces are fingerprinted. A VPN or game accelerator
 * raising a TUN adapter shows up here; the interval is short enough that recovery feels
 * automatic and the probe itself is a synchronous `os.networkInterfaces()` read.
 */
const NETWORK_WATCH_INTERVAL_MS = 10_000

/** Proxy preferences that drive the global proxy. Changing any of them re-applies it. */
const PROXY_PREFERENCE_KEYS = [
  'app.proxy.mode',
  'app.proxy.url',
  'app.proxy.bypass_rules'
] as const satisfies readonly UnifiedPreferenceKeyType[]

/** Identity of an applied proxy config, for latest-wins settle detection. */
const proxyConfigKey = (c: Pick<ProxyConfig, 'mode' | 'proxyRules' | 'proxyBypassRules'>): string =>
  `${c.mode}|${c.proxyRules ?? ''}|${c.proxyBypassRules ?? ''}`

/**
 * Map the user-facing proxy mode to an Electron {@link ProxyConfig}. `system` returns the bare
 * `system` mode; the concrete system proxy URL is resolved from the OS later. A `custom` mode
 * without a URL can't form a fixed-servers config, so it falls back to direct.
 */
export function resolveProxyConfig({
  mode,
  url,
  bypassRules
}: {
  mode: ProxyMode
  url: string
  bypassRules: string
}): ProxyConfig {
  switch (mode) {
    case 'none':
      return { mode: 'direct' }
    case 'custom':
      return url
        ? { mode: 'fixed_servers', proxyRules: url, proxyBypassRules: bypassRules || undefined }
        : { mode: 'direct' }
    case 'system':
    default:
      return { mode: 'system' }
  }
}

@Injectable('ProxyService')
@ServicePhase(Phase.WhenReady)
@DependsOn(['PowerService'])
export class ProxyService extends BaseService {
  private systemProxyInterval: Disposable | null = null
  private appliedKey: string | null = null
  private nodeProxyController: NodeProxyController | null = null
  private networkFingerprint: string | null = null
  /**
   * Set by {@link requestForcedReapply}, consumed by the next {@link applyProxyConfig}.
   * Marks that pass as a recovery rather than a settings change, so it also tears down
   * Chromium's sockets and DNS cache instead of only swapping the proxy config.
   */
  private forceReapplyPending = false

  // Latest-wins reconciler: rapid proxy-preference toggles (or system-proxy changes) collapse
  // into a single re-read + re-apply — single-flight and level-triggered, so a change landing
  // mid-apply re-converges instead of being dropped. See #16233.
  private readonly proxyReconciler = createLatestReconciler<ProxyConfig>({
    name: 'proxy',
    getSnapshot: () => this.snapshotProxyConfig(),
    // The forced flag is part of the predicate, not a side channel: a network change landing
    // mid-apply must survive that pass's closing `appliedKey` write and drive another one.
    isSettled: (config) => proxyConfigKey(config) === this.appliedKey && !this.forceReapplyPending,
    apply: (config) => this.applyProxyConfig(config)
  })

  /**
   * Key of the currently applied proxy config (null before the first apply).
   * Exposed so RegionService can invalidate its cached egress country the
   * moment the proxy — and thus the egress IP — changes.
   */
  get appliedProxyKey(): string | null {
    return this.appliedKey
  }

  /** Routing policy for isolated runtimes. All proxy/bypass semantics stay in main. */
  async getRoutingSnapshot(): Promise<ProxyRoutingSnapshot> {
    await this.proxyReconciler.flush()
    return this.getNodeProxyController().getRoutingSnapshot()
  }

  /**
   * Re-apply the proxy even though its configuration is unchanged, tearing down the
   * connection state both network stacks hold.
   *
   * A settings change is not the only thing that invalidates a proxy: when the OS network
   * path is rebuilt (VPN / game-accelerator TUN adapter, link switch, sleep-wake), Chromium
   * keeps sockets that are now black-holed and DNS entries resolved through the old route,
   * while the Node stack keeps agent and dispatcher pools. `session.setProxy()` alone
   * replaces none of that, which is why traffic stayed dead until the app was restarted.
   *
   * Both settled-checks are cleared so the reconciler cannot short-circuit on an unchanged
   * config, then convergence runs through the same single-flight loop as any other change.
   */
  public requestForcedReapply(reason: string): void {
    logger.info(`Forcing proxy re-apply: ${reason}`)
    this.forceReapplyPending = true
    this.appliedKey = null
    this.nodeProxyController?.invalidate()
    this.proxyReconciler.request()
  }

  /**
   * Apply the proxy from user preferences on startup, then re-apply whenever the proxy
   * preferences change. Without this the global proxy mechanism is never wired to settings —
   * changing the proxy in the UI would have no effect on the network stack.
   */
  protected async onReady(): Promise<void> {
    this.registerDisposable(
      application
        .get('PreferenceService')
        .subscribeMultipleChanges([...PROXY_PREFERENCE_KEYS], () => this.proxyReconciler.request())
    )
    this.watchNetworkPathChanges()
    // Don't gate startup on the initial apply. The OS-proxy read (a `scutil` spawn in system
    // mode) only feeds the Node-side controller, which no startup request hits; Electron sessions
    // already follow the system proxy by Chromium default. Converge in the background instead.
    this.proxyReconciler.request()
    void this.proxyReconciler.flush().then(() => {
      const error = this.proxyReconciler.getLastError()
      if (error) {
        logger.error('Initial proxy apply failed; traffic uses the default route until the next change', error as Error)
      }
    })
  }

  /**
   * Watch for the network path moving under us — the trigger the forced re-apply exists for.
   *
   * Interface fingerprinting catches an adapter appearing or disappearing, which is how a VPN
   * or game accelerator shows up. Sleep-wake is added on top because it invalidates the same
   * connection state without necessarily touching the interface list. A proxy client that only
   * rewrites the routing table, adding no adapter, is not detectable here.
   */
  private watchNetworkPathChanges(): void {
    this.networkFingerprint = networkInterfacesFingerprint()
    this.registerInterval(() => {
      const fingerprint = networkInterfacesFingerprint()
      if (fingerprint === this.networkFingerprint) return
      this.networkFingerprint = fingerprint
      this.requestForcedReapply('network interfaces changed')
    }, NETWORK_WATCH_INTERVAL_MS)

    this.registerDisposable(
      application.get('PowerService').onResume(() => {
        this.networkFingerprint = networkInterfacesFingerprint()
        this.requestForcedReapply('system resumed from sleep')
      })
    )
  }

  /** Latest intent from preferences, resolving the concrete OS proxy for `system` mode. */
  private async snapshotProxyConfig(): Promise<ProxyConfig> {
    const preferenceService = application.get('PreferenceService')
    const config = resolveProxyConfig({
      mode: preferenceService.get('app.proxy.mode'),
      url: preferenceService.get('app.proxy.url'),
      bypassRules: preferenceService.get('app.proxy.bypass_rules')
    })
    if (config.mode === 'system') {
      // A failed OS read must not abort the apply — fall back to bare system mode so Electron
      // still applies something instead of leaving the proxy unconfigured.
      try {
        const currentProxy = await getSystemProxy()
        if (currentProxy) {
          config.proxyRules = currentProxy.proxyUrl.toLowerCase()
          config.proxyBypassRules = currentProxy.noProxy.join(',')
        }
      } catch (error) {
        logger.warn('Failed to read OS system proxy; applying bare system mode', error as Error)
      }
    }
    return config
  }

  private async applyProxyConfig(config: ProxyConfig): Promise<void> {
    // Read-and-clear before the awaits: a network change landing mid-apply must arm the
    // next pass rather than be swallowed by this one.
    const isForced = this.forceReapplyPending
    this.forceReapplyPending = false

    logger.info(`apply proxy: ${config.mode} ${config.proxyRules ?? ''} ${config.proxyBypassRules ?? ''}`)
    // In system mode, poll the OS proxy so external changes re-converge through the reconciler.
    if (config.mode === 'system') this.ensureSystemProxyMonitor()
    else this.clearSystemProxyMonitor()

    await this.setGlobalProxy(config)
    if (isForced) await this.resetSessionNetworkState()
    this.appliedKey = proxyConfigKey(config)
  }

  /**
   * Discard the per-session network state that `setProxy` leaves intact: stale sockets,
   * DNS entries (negative ones included) resolved through the old path, and the cached
   * proxy resolution.
   *
   * Forced re-applies only. `closeAllConnections` kills in-flight requests, which is right
   * when the path is already broken but would abort a healthy AI stream if it ran on every
   * settings change. Each step is awaited individually so one failure can't skip the rest.
   */
  private async resetSessionNetworkState(): Promise<void> {
    for (const targetSession of this.getManagedSessions()) {
      for (const [step, run] of [
        ['forceReloadProxyConfig', () => targetSession.forceReloadProxyConfig()],
        ['clearHostResolverCache', () => targetSession.clearHostResolverCache()],
        ['closeAllConnections', () => targetSession.closeAllConnections()]
      ] as const) {
        try {
          await run()
        } catch (error) {
          logger.warn(`Failed to reset session network state (${step})`, error as Error)
        }
      }
    }
  }

  private ensureSystemProxyMonitor(): void {
    if (this.systemProxyInterval) return
    this.systemProxyInterval = this.registerInterval(() => this.proxyReconciler.request(), 1000 * 60)
  }

  private clearSystemProxyMonitor(): void {
    if (this.systemProxyInterval) {
      this.systemProxyInterval.dispose()
      this.systemProxyInterval = null
    }
  }

  private async setGlobalProxy(config: ProxyConfig): Promise<void> {
    await this.getNodeProxyController().configure({
      proxyRules: config.mode === 'direct' ? undefined : config.proxyRules,
      proxyBypassRules: config.proxyBypassRules
    })
    await this.setSessionsProxy(config)
  }

  private getNodeProxyController(): NodeProxyController {
    this.nodeProxyController ??= new NodeProxyController(logger)
    return this.nodeProxyController
  }

  /**
   * Sessions this service owns the proxy for. `persist:miniapp:*` is deliberately absent:
   * those partitions run a constant deny-all PAC (features/miniApp/runtime/network.ts) that
   * a user proxy change must never overwrite.
   */
  private getManagedSessions(): Electron.Session[] {
    return [
      session.defaultSession,
      session.fromPartition('persist:webview'),
      session.fromPartition(HTML_ARTIFACT_PREVIEW_PARTITION)
    ]
  }

  private async setSessionsProxy(config: ProxyConfig): Promise<void> {
    // Await the session AND app proxy config together so a one-shot apply can't fail
    // silently and callers can rely on the proxy being in effect once this resolves.
    await Promise.all([...this.getManagedSessions().map((s) => s.setProxy(config)), app.setProxy(config)])
  }
}
