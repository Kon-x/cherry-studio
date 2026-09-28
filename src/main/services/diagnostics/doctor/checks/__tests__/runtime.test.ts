import { beforeEach, describe, expect, it, vi } from 'vitest'

const services = vi.hoisted(() => ({
  ready: true,
  getToolInventory: vi.fn(),
  checkClaudeLogin: vi.fn(),
  listAgents: vi.fn(),
  getProviderByProviderId: vi.fn()
}))
vi.mock('@application', async () => {
  const { mockApplicationFactory } = await import('@test-mocks/main/application')
  return mockApplicationFactory({
    BinaryManager: {
      get isReady() {
        return services.ready
      },
      getToolInventory: services.getToolInventory
    }
  } as never)
})
const { managedTools } = await import('../runtime')
const signal = new AbortController().signal
const ctx = { signal, share: <T>(_key: string, factory: (signal: AbortSignal) => Promise<T>) => factory(signal) }

beforeEach(() => {
  vi.clearAllMocks()
  services.ready = true
  services.getToolInventory.mockResolvedValue([])
})

describe('runtime-managed-tools', () => {
  it('does not declare failed initialization healthy', async () => {
    services.ready = false
    await expect(managedTools.run(ctx)).rejects.toThrow('not ready')
  })
  it('rejects an inventory containing unknown entries', async () => {
    services.getToolInventory.mockResolvedValue([{ name: 'uv', status: 'unknown' }])
    await expect(managedTools.run(ctx)).rejects.toThrow('incomplete')
  })

  it('does not treat an uninstalled tool as broken', async () => {
    services.getToolInventory.mockResolvedValue([
      { name: 'bun', status: 'ready' },
      { name: 'fd', status: 'not_installed' }
    ])
    await expect(managedTools.run(ctx)).resolves.toEqual({ status: 'pass' })
  })

  it('warns for failed operations or broken managed installations', async () => {
    services.getToolInventory.mockResolvedValue([
      { name: 'bun', status: 'failed' },
      { name: 'fd', status: 'ready' },
      { name: 'uv', status: 'failed' }
    ])
    await expect(managedTools.run(ctx)).resolves.toMatchObject({
      status: 'warn',
      attribution: 'user-fixable',
      detail: { variant: 'failed', params: { count: 2 } },
      actions: [{ kind: 'navigate', target: '/settings/dependencies' }],
      evidence: [{ key: 'tools', value: 'bun, uv', dataClass: 'local_only' }]
    })
  })
})
