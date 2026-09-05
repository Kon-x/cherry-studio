/**
 * Runtime-neutral local API Gateway route resolution, shared by drivers whose
 * provider policy or wire protocol requires the gateway. Owns the consent →
 * convergence → key sequence.
 */

import { CHERRY_CLOUD_PROVIDER_ID } from '@shared/data/presets/cherryai'
import { API_GATEWAY_REQUIRED_I18N_KEY } from '@shared/types/apiGateway'

/** Whether Agent traffic for this provider must pass through Cherry's local API Gateway. */
export function requiresAgentGateway(providerId: string): boolean {
  return providerId === CHERRY_CLOUD_PROVIDER_ID
}

/**
 * Rotation-sensitive gateway identity for connection signatures: address, key, or state changes
 * rebuild the connection. Read-only by contract — this must never generate or persist a key.
 *
 * Fork: API Gateway removed, function disabled.
 */
export function gatewayCredentialsFingerprint(): string {
  throw new Error('API Gateway has been removed from this fork')
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

/** Consent, convergence, and key sequence in one place — every gateway route resolves through here.
 *
 * Fork: API Gateway removed, function disabled.
 */
export async function resolveApiGatewayRuntime(): Promise<{
  baseUrl: string
  apiKey: string
  usageHeaders: Record<string, string>
  internalRequestToken: string
}> {
  throw new Error('API Gateway has been removed from this fork')
}
