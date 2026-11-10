import type { SerializedError } from '@renderer/types/error'
import { providerErrorText } from '@renderer/utils/error'

export function healthCheckErrorToDisplayString(error: SerializedError | string | undefined | null): string {
  if (error == null) return ''
  if (typeof error === 'string') return error.trim()

  // `providerErrorText` prefers the provider's own response body — `message` alone is the
  // HTTP statusText ("Forbidden") whenever the body misses the SDK's error schema.
  const message = providerErrorText(error).trim()
  if (message) return message
  return error.name?.trim() ?? ''
}
