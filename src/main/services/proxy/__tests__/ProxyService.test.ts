import { MockMainPreferenceServiceUtils } from '@test-mocks/main/PreferenceService'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  nodeProxyConfigureMock,
  nodeProxyRoutingSnapshotMock,
  nodeProxyControllerConstructorMock,
  nodeProxyInvalidateMock,
  sessionSetProxyMock,
  webviewSetProxyMock,
  appSetProxyMock,
  getSystemProxyMock,
  intervalRegistrations,
  networkFingerprintMock,
  powerResumeListeners,
  sessionResetMocks
} = vi.hoisted(() => {
  const nodeProxyConfigureMock = vi.fn()
  const nodeProxyRoutingSnapshotMock = vi.fn()
  const nodeProxyInvalidateMock = vi.fn()
  const makeSessionResetMocks = () => ({
    forceReloadProxyConfig: vi.fn().mockResolvedValue(undefined),
    clearHostResolverCache: vi.fn().mockResolvedValue(undefined),
    closeAllConnections: vi.fn().mockResolvedValue(undefined)
  })

  return {
    nodeProxyConfigureMock,
    nodeProxyRoutingSnapshotMock,
    nodeProxyInvalidateMock,
    nodeProxyControllerConstructorMock: vi.fn(() => ({
      configure: nodeProxyConfigureMock,
      getRoutingSnapshot: nodeProxyRoutingSnapshotMock,
      invalidate: nodeProxyInvalidateMock
    })),
    sessionSetProxyMock: vi.fn().mockResolvedValue(undefined),
    webviewSetProxyMock: vi.fn().mockResolvedValue(undefined),
    appSetProxyMock: vi.fn().mockResolvedValue(undefined),
    getSystemProxyMock: vi.fn(),
    intervalRegistrations: [] as Array<{
      handler: () => void
      dispose: ReturnType<typeof vi.fn>
      intervalMs: number
    }>,
    networkFingerprintMock: vi.fn(() => 'wifi'),
    powerResumeListeners: [] as Array<() => void>,
    // Keyed per partition: a shared object would double every managed-session counter.
    sessionResetMocks: {
      default: makeSessionResetMocks(),
      'persist:webview': makeSessionResetMocks(),
      'html-artifact-preview': makeSessionResetMocks()
    } as Record<string, ReturnType<typeof makeSessionResetMocks>>
  }
})

vi.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
  }
}))

vi.mock('@main/core/lifecycle', () => {
  class MockBaseService {
    protected readonly _disposables: Array<{ dispose: () => void } | (() => void)> = []
    protected registerDisposable<T extends { dispose: () => void } | (() => void)>(disposable: T): T {
      this._disposables.push(disposable)
      return disposable
    }
    protected registerInterval(handler: () => void, intervalMs: number) {
      const dispose = vi.fn()
      intervalRegistrations.push({ handler, dispose, intervalMs })
      this._disposables.push({ dispose })
      return { dispose }
    }
  }
  return {
    BaseService: MockBaseService,
    Injectable: () => (target: unknown) => target,
    ServicePhase: () => (target: unknown) => target,
    DependsOn: () => (target: unknown) => target,
    Phase: { WhenReady: 'whenReady' }
  }
})

vi.mock('@application', async () => {
  const { mockApplicationFactory } = await import('@test-mocks/main/application')
  return mockApplicationFactory({
    PowerService: {
      onResume: (listener: () => void) => {
        powerResumeListeners.push(listener)
        return { dispose: vi.fn() }
      }
    }
  })
})

vi.mock('../NodeProxyController', () => ({
  NodeProxyController: nodeProxyControllerConstructorMock
}))

vi.mock('../networkFingerprint', () => ({
  networkInterfacesFingerprint: networkFingerprintMock
}))

vi.mock('os-proxy-config', () => ({ getSystemProxy: getSystemProxyMock }))

vi.mock('electron', () => ({
  app: { setProxy: appSetProxyMock },
  session: {
    defaultSession: { setProxy: sessionSetProxyMock, ...sessionResetMocks.default },
    fromPartition: vi.fn((partition: string) => ({
      setProxy: webviewSetProxyMock,
      ...sessionResetMocks[partition]
    }))
  }
}))

const { ProxyService, resolveProxyConfig } = await import('../ProxyService')

const reconcilerOf = (manager: unknown) =>
  (manager as { proxyReconciler: { flush: () => Promise<void>; getLastError: () => unknown } }).proxyReconciler

const SYSTEM_PROXY_MONITOR_MS = 1000 * 60
const NETWORK_WATCH_MS = 10_000

/** Intervals are selected by their period: the two watchers must never be conflated. */
const systemProxyMonitors = () => intervalRegistrations.filter((i) => i.intervalMs === SYSTEM_PROXY_MONITOR_MS)
const networkWatcher = () => {
  const watchers = intervalRegistrations.filter((i) => i.intervalMs === NETWORK_WATCH_MS)
  expect(watchers).toHaveLength(1)
  return watchers[0]
}

const allSessionResetMocks = () => Object.values(sessionResetMocks)

describe('resolveProxyConfig', () => {
  it('maps none → direct', () => {
    expect(resolveProxyConfig({ mode: 'none', url: 'http://ignored:1', bypassRules: 'ignored' })).toEqual({
      mode: 'direct'
    })
  })

  it('maps system → system (OS proxy resolved later in snapshotProxyConfig)', () => {
    expect(resolveProxyConfig({ mode: 'system', url: '', bypassRules: '' })).toEqual({ mode: 'system' })
  })

  it('maps custom + url → fixed_servers with bypass rules', () => {
    expect(resolveProxyConfig({ mode: 'custom', url: 'http://127.0.0.1:7890', bypassRules: '*.local' })).toEqual({
      mode: 'fixed_servers',
      proxyRules: 'http://127.0.0.1:7890',
      proxyBypassRules: '*.local'
    })
  })

  it('maps custom + empty bypass → undefined bypass', () => {
    expect(resolveProxyConfig({ mode: 'custom', url: 'http://127.0.0.1:7890', bypassRules: '' })).toEqual({
      mode: 'fixed_servers',
      proxyRules: 'http://127.0.0.1:7890',
      proxyBypassRules: undefined
    })
  })

  it('falls back custom without url → direct', () => {
    expect(resolveProxyConfig({ mode: 'custom', url: '', bypassRules: '' })).toEqual({ mode: 'direct' })
  })
})

describe('ProxyService — preference wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockMainPreferenceServiceUtils.resetMocks()
    intervalRegistrations.length = 0
    powerResumeListeners.length = 0
    networkFingerprintMock.mockReturnValue('wifi')
    getSystemProxyMock.mockResolvedValue({ proxyUrl: 'http://system:1080', noProxy: ['localhost'] })
    nodeProxyRoutingSnapshotMock.mockReturnValue({ version: 1, mode: 'direct' })
  })

  it('defers Node proxy controller construction until proxy apply', async () => {
    const manager = new ProxyService()
    expect(nodeProxyControllerConstructorMock).not.toHaveBeenCalled()

    await (manager as any).onReady()
    await reconcilerOf(manager).flush()

    expect(nodeProxyControllerConstructorMock).toHaveBeenCalledTimes(1)
  })

  it('applies the custom proxy from preferences on ready (Node stack + Electron sessions)', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('app.proxy.mode', 'custom')
    MockMainPreferenceServiceUtils.setPreferenceValue('app.proxy.url', 'http://127.0.0.1:7890')
    MockMainPreferenceServiceUtils.setPreferenceValue('app.proxy.bypass_rules', 'localhost')

    const manager = new ProxyService()
    await (manager as any).onReady()
    // onReady no longer blocks on the initial apply; await convergence before asserting.
    await reconcilerOf(manager).flush()

    expect(nodeProxyConfigureMock).toHaveBeenCalledWith({
      proxyRules: 'http://127.0.0.1:7890',
      proxyBypassRules: 'localhost'
    })
    const expected = { mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:7890', proxyBypassRules: 'localhost' }
    expect(sessionSetProxyMock).toHaveBeenCalledWith(expected)
    expect(webviewSetProxyMock).toHaveBeenCalledWith(expected)
    expect(appSetProxyMock).toHaveBeenCalledWith(expected)
  })

  it('applies the resolved system proxy on ready to every stack', async () => {
    // Default mode is 'system'; getSystemProxy returns a known proxy (set in beforeEach).
    const manager = new ProxyService()
    await (manager as any).onReady()
    await reconcilerOf(manager).flush()

    const expected = { mode: 'system', proxyRules: 'http://system:1080', proxyBypassRules: 'localhost' }
    expect(nodeProxyConfigureMock).toHaveBeenCalledWith({
      proxyRules: 'http://system:1080',
      proxyBypassRules: 'localhost'
    })
    expect(sessionSetProxyMock).toHaveBeenCalledWith(expected)
    expect(webviewSetProxyMock).toHaveBeenCalledWith(expected)
    expect(appSetProxyMock).toHaveBeenCalledWith(expected)
  })

  it('exposes the applied Node routing policy as a snapshot for isolated consumers', async () => {
    const manager = new ProxyService()
    await (manager as any).onReady()

    await expect(manager.getRoutingSnapshot()).resolves.toEqual({ version: 1, mode: 'direct' })

    expect(nodeProxyConfigureMock).toHaveBeenCalledBefore(nodeProxyRoutingSnapshotMock)
  })

  it('applies bare system mode when the OS proxy is unavailable', async () => {
    getSystemProxyMock.mockResolvedValue(null)
    const manager = new ProxyService()
    await (manager as any).onReady()
    await reconcilerOf(manager).flush()

    expect(sessionSetProxyMock).toHaveBeenCalledWith({ mode: 'system' })
    expect(appSetProxyMock).toHaveBeenCalledWith({ mode: 'system' })
    expect(nodeProxyConfigureMock).toHaveBeenCalledWith({ proxyRules: undefined, proxyBypassRules: undefined })
  })

  it('re-applies when a proxy preference changes after ready', async () => {
    // Default mode is 'system'.
    const manager = new ProxyService()
    await (manager as any).onReady()
    await reconcilerOf(manager).flush()
    nodeProxyConfigureMock.mockClear()

    MockMainPreferenceServiceUtils.setPreferenceValue('app.proxy.mode', 'none')

    // The subscriber kicks off an un-awaited async re-apply; wait for it to settle.
    await vi.waitFor(() =>
      expect(nodeProxyConfigureMock).toHaveBeenCalledWith({ proxyRules: undefined, proxyBypassRules: undefined })
    )
    expect(sessionSetProxyMock).toHaveBeenLastCalledWith({ mode: 'direct' })
  })

  it('coalesces to the latest change when one lands while an apply is in flight', async () => {
    // Block the first apply mid-flight so a newer change arrives before it finishes.
    let releaseFirstApply!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseFirstApply = resolve
    })
    sessionSetProxyMock.mockReturnValueOnce(gate.then(() => undefined))

    MockMainPreferenceServiceUtils.setPreferenceValue('app.proxy.mode', 'custom')
    MockMainPreferenceServiceUtils.setPreferenceValue('app.proxy.url', 'http://first:1')

    const manager = new ProxyService()
    await (manager as any).onReady()

    // Newer change lands while the first apply is gated.
    MockMainPreferenceServiceUtils.setPreferenceValue('app.proxy.url', 'http://second:2')

    releaseFirstApply()
    await reconcilerOf(manager).flush()

    // Latest wins: the final applied config targets the second URL (not dropped).
    expect(sessionSetProxyMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'fixed_servers', proxyRules: 'http://second:2' })
    )
  })

  it('manages the system-proxy monitor across mode switches', async () => {
    const manager = new ProxyService()
    const reconciler = reconcilerOf(manager)
    await (manager as any).onReady()
    await reconciler.flush()

    // System apply starts exactly one monitor interval.
    expect(systemProxyMonitors()).toHaveLength(1)
    const monitor = systemProxyMonitors()[0]
    expect(monitor.dispose).not.toHaveBeenCalled()

    // An OS-proxy change via the monitor tick re-applies but does NOT re-register the interval.
    getSystemProxyMock.mockResolvedValue({ proxyUrl: 'http://system2:2', noProxy: [] })
    monitor.handler()
    await reconciler.flush()
    expect(sessionSetProxyMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'system', proxyRules: 'http://system2:2' })
    )
    expect(systemProxyMonitors()).toHaveLength(1)

    // An unchanged OS read is a no-op (appliedKey/isSettled suppresses the apply).
    sessionSetProxyMock.mockClear()
    monitor.handler()
    await reconciler.flush()
    expect(sessionSetProxyMock).not.toHaveBeenCalled()

    // system → custom disposes the monitor (and doesn't start a new one).
    MockMainPreferenceServiceUtils.setPreferenceValue('app.proxy.mode', 'custom')
    MockMainPreferenceServiceUtils.setPreferenceValue('app.proxy.url', 'http://custom:1')
    await reconciler.flush()
    expect(monitor.dispose).toHaveBeenCalledTimes(1)
    expect(systemProxyMonitors()).toHaveLength(1)

    // custom → system restarts it.
    MockMainPreferenceServiceUtils.setPreferenceValue('app.proxy.mode', 'system')
    await reconciler.flush()
    expect(systemProxyMonitors()).toHaveLength(2)
  })
})

describe('ProxyService — network path recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockMainPreferenceServiceUtils.resetMocks()
    intervalRegistrations.length = 0
    powerResumeListeners.length = 0
    networkFingerprintMock.mockReturnValue('wifi')
    nodeProxyRoutingSnapshotMock.mockReturnValue({ version: 1, mode: 'direct' })
    // The reported bug's configuration: a local HTTP proxy in custom mode.
    MockMainPreferenceServiceUtils.setPreferenceValue('app.proxy.mode', 'custom')
    MockMainPreferenceServiceUtils.setPreferenceValue('app.proxy.url', 'http://127.0.0.1:7890')
  })

  /** Boot a service that has already converged on the local-proxy config. */
  async function bootConverged() {
    const manager = new ProxyService()
    await (manager as any).onReady()
    await reconcilerOf(manager).flush()
    vi.clearAllMocks()
    return manager
  }

  it('rebuilds both network stacks when an accelerator adapter appears, without a config change', async () => {
    const manager = await bootConverged()

    networkFingerprintMock.mockReturnValue('wifi+tun')
    networkWatcher().handler()
    await reconcilerOf(manager).flush()

    // Node stack: the memoized config key is dropped so the agents/dispatcher are rebuilt.
    expect(nodeProxyInvalidateMock).toHaveBeenCalledTimes(1)
    expect(nodeProxyConfigureMock).toHaveBeenCalledWith({
      proxyRules: 'http://127.0.0.1:7890',
      proxyBypassRules: undefined
    })
    // Chromium stack: setProxy alone leaves the dead sockets and DNS entries in place.
    for (const resets of allSessionResetMocks()) {
      expect(resets.forceReloadProxyConfig).toHaveBeenCalledTimes(1)
      expect(resets.clearHostResolverCache).toHaveBeenCalledTimes(1)
      expect(resets.closeAllConnections).toHaveBeenCalledTimes(1)
    }
  })

  it('recovers again when the adapter disappears after an earlier recovery', async () => {
    const manager = await bootConverged()

    networkFingerprintMock.mockReturnValue('wifi+tun')
    networkWatcher().handler()
    await reconcilerOf(manager).flush()

    networkFingerprintMock.mockReturnValue('wifi')
    networkWatcher().handler()
    await reconcilerOf(manager).flush()

    expect(sessionResetMocks.default.closeAllConnections).toHaveBeenCalledTimes(2)
  })

  it('leaves the network alone while the interfaces are unchanged', async () => {
    const manager = await bootConverged()

    networkWatcher().handler()
    networkWatcher().handler()
    await reconcilerOf(manager).flush()

    expect(nodeProxyInvalidateMock).not.toHaveBeenCalled()
    expect(nodeProxyConfigureMock).not.toHaveBeenCalled()
    expect(sessionResetMocks.default.closeAllConnections).not.toHaveBeenCalled()
  })

  it('recovers on wake from sleep', async () => {
    const manager = await bootConverged()
    expect(powerResumeListeners).toHaveLength(1)

    powerResumeListeners[0]()
    await reconcilerOf(manager).flush()

    expect(sessionResetMocks.default.closeAllConnections).toHaveBeenCalledTimes(1)
  })

  it('never tears down live connections for an ordinary settings change', async () => {
    const manager = await bootConverged()

    MockMainPreferenceServiceUtils.setPreferenceValue('app.proxy.url', 'http://127.0.0.1:1080')
    await vi.waitFor(() =>
      expect(nodeProxyConfigureMock).toHaveBeenCalledWith({
        proxyRules: 'http://127.0.0.1:1080',
        proxyBypassRules: undefined
      })
    )
    await reconcilerOf(manager).flush()

    // closeAllConnections would abort in-flight AI streams; only recovery may pay that cost.
    for (const resets of allSessionResetMocks()) {
      expect(resets.closeAllConnections).not.toHaveBeenCalled()
      expect(resets.clearHostResolverCache).not.toHaveBeenCalled()
      expect(resets.forceReloadProxyConfig).not.toHaveBeenCalled()
    }
  })

  it('re-arms when the path changes again while a recovery is in flight', async () => {
    const manager = await bootConverged()

    // Gate the first recovery inside its apply, so the second change lands mid-flight rather
    // than coalescing with the first (two changes before any apply are one recovery by design).
    let releaseApply!: () => void
    let applyStarted!: () => void
    const applyReached = new Promise<void>((resolve) => (applyStarted = resolve))
    sessionSetProxyMock.mockImplementationOnce(() => {
      applyStarted()
      return new Promise<void>((resolve) => (releaseApply = resolve))
    })

    networkFingerprintMock.mockReturnValue('wifi+tun')
    networkWatcher().handler()
    await applyReached

    networkFingerprintMock.mockReturnValue('ethernet')
    networkWatcher().handler()
    releaseApply()
    await reconcilerOf(manager).flush()

    // The in-flight pass ends by writing appliedKey; without the forced flag in `isSettled`
    // that write makes the loop look converged and the second change is lost.
    expect(sessionResetMocks.default.closeAllConnections).toHaveBeenCalledTimes(2)
  })

  it('still applies the proxy when a session reset step fails', async () => {
    const manager = await bootConverged()
    sessionResetMocks.default.closeAllConnections.mockRejectedValueOnce(new Error('session gone'))

    networkFingerprintMock.mockReturnValue('wifi+tun')
    networkWatcher().handler()
    await reconcilerOf(manager).flush()

    expect(reconcilerOf(manager).getLastError()).toBeNull()
    expect(sessionResetMocks['persist:webview'].closeAllConnections).toHaveBeenCalledTimes(1)
    expect(nodeProxyConfigureMock).toHaveBeenCalledTimes(1)
  })
})
