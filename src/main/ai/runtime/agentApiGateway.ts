import { API_GATEWAY_REQUIRED_I18N_KEY } from '@shared/types/apiGateway'

const FORK_GATEWAY_REMOVED_FINGERPRINT = 'fork:api-gateway-removed'

/**
 * Rotation-sensitive gateway auth identity for connection signatures: key edits or gateway
 * enable/running flips rebuild the connection instead of quietly posting stale credentials.
 * Read-only by contract — snapshot capture must never generate or persist a key.
 */
export function gatewayCredentialsFingerprint(): string {
  return FORK_GATEWAY_REMOVED_FINGERPRINT
}

/**
 * The route needs Cherry's local gateway to bridge the model, but the user keeps the gateway
 * disabled. Raised on the persisted intent only — a gateway that is enabled but not yet listening
 * is a convergence problem, not a consent one, and surfaces its own bind error. `i18nKey` survives
 * `serializeError`, so the turn's error block renders localized copy; the connection driver
 * additionally turns this into a prompt offering to enable it.
 */
export class ApiGatewayNotRunningError extends Error {
  readonly i18nKey = API_GATEWAY_REQUIRED_I18N_KEY
  constructor() {
    super('API Gateway is disabled')
    this.name = 'ApiGatewayNotRunningError'
  }
}

/** Consent, convergence, and key sequence in one place — every gateway route resolves through here. */
export async function resolveApiGatewayRuntime(sessionId: string): Promise<{
  baseUrl: string
  apiKey: string
  stateTag: string
  usageHeaders: Record<string, string>
  internalRequestToken: string
}> {
  void sessionId
  throw new ApiGatewayNotRunningError()
}
