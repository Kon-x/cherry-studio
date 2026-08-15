import { useCallback } from 'react'

/**
 * API Gateway hook — the gateway was removed from this fork. This stub keeps the
 * former consumers (the agents-side "gateway required" dialog) compiling: the
 * gateway is never running, never loading, and every command reports failure.
 */
export const useApiGateway = () => {
  const startApiGateway = useCallback(async (): Promise<boolean> => false, [])
  const stopApiGateway = useCallback(async () => {}, [])
  const restartApiGateway = useCallback(async () => {}, [])

  return {
    apiGatewayRunning: false,
    apiGatewayLoading: false,
    startApiGateway,
    stopApiGateway,
    restartApiGateway
  }
}
