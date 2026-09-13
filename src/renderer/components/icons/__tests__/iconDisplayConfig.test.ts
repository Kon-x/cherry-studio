import { describe, expect, it } from 'vitest'

import { getIconDisplayConfig } from '../iconDisplayConfig'

describe('getIconDisplayConfig', () => {
  it.each(['cherryin', 'aihubmix', 'lmstudio', 'anthropic', 'yi', 'groq', 'aws-bedrock', 'tokendance'])(
    'contains the %s provider logo in the provider-list context',
    (providerId) => {
      expect(getIconDisplayConfig('provider-list', providerId)).toEqual({ scale: 5 / 7, borderRadius: 5 })
    }
  )

  it('enlarges provider logos outside the contained-icon list', () => {
    expect(getIconDisplayConfig('provider-list', 'openai')).toEqual({ scale: 1.2 })
  })
})
