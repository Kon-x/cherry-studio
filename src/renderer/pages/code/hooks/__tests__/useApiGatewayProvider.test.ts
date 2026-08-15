import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useApiGatewayProvider } from '../useApiGatewayProvider'

// Fork contract: the API gateway was removed, so the code-CLI provider list must
// never be offered a synthetic gateway provider.
describe('useApiGatewayProvider', () => {
  it('returns null now that the gateway is removed', () => {
    const { result } = renderHook(() => useApiGatewayProvider())
    expect(result.current).toBeNull()
  })
})
