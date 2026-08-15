import type { Provider } from '@shared/data/types/provider'

/**
 * The synthetic "Cherry Gateway" entry for the code-CLI provider list. The API
 * gateway was removed from this fork, so no gateway provider is ever offered;
 * the bundle type survives for the consumers' prop shapes.
 */
export interface ApiGatewayProviderBundle {
  provider: Provider
  /** Current persisted gateway key; `null` before the gateway has ever started (main generates it lazily). */
  apiKey: string | null
  /** Start the gateway if needed (generating the key on first start) and resolve the freshest key. */
  ensureReady: () => Promise<string>
}

export function useApiGatewayProvider(): ApiGatewayProviderBundle | null {
  return null
}
