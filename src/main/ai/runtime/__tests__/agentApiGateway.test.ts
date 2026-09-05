import { CHERRY_CLOUD_PROVIDER_ID } from '@shared/data/presets/cherryai'
import { API_GATEWAY_REQUIRED_I18N_KEY } from '@shared/types/apiGateway'
import { describe, expect, it } from 'vitest'

import { ApiGatewayNotRunningError, requiresAgentGateway, resolveApiGatewayRuntime } from '../agentApiGateway'

describe('agent gateway boundary', () => {
  it('keeps Cloud behind the gateway boundary without blocking direct providers', () => {
    expect(requiresAgentGateway(CHERRY_CLOUD_PROVIDER_ID)).toBe(true)
    expect(requiresAgentGateway('anthropic')).toBe(false)
    expect(requiresAgentGateway('deepseek')).toBe(false)
  })

  it('rejects gateway routes with the localized runtime error without a gateway service', async () => {
    await expect(resolveApiGatewayRuntime()).rejects.toBeInstanceOf(ApiGatewayNotRunningError)
    await expect(resolveApiGatewayRuntime()).rejects.toMatchObject({ i18nKey: API_GATEWAY_REQUIRED_I18N_KEY })
  })
})
