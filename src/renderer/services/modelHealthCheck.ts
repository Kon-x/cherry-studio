import type { SerializedError } from '@renderer/types/error'
import { providerErrorText } from '@renderer/utils/error'

export function healthCheckErrorToDisplayString(error: SerializedError | string | undefined | null): string {
  if (error == null) return ''
  if (typeof error === 'string') return error.trim()

  const message = providerErrorText(error).trim()
  if (message) return message
  return error.name?.trim() ?? ''
}
