import { describe, expect, it } from 'vitest'

import { ApiGatewayNotRunningError, gatewayCredentialsFingerprint, resolveApiGatewayRuntime } from '../agentApiGateway'

describe('gatewayCredentialsFingerprint', () => {
  it('uses a stable fork sentinel without reading removed gateway state', () => {
    expect(gatewayCredentialsFingerprint()).toBe('fork:api-gateway-removed')
  })
})

describe('resolveApiGatewayRuntime', () => {
  it('rejects every gateway route in this fork', async () => {
    await expect(resolveApiGatewayRuntime('session-1')).rejects.toBeInstanceOf(ApiGatewayNotRunningError)
  })
})
