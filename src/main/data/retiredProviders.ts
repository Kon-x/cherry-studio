const RETIRED_PROVIDER_IDS = new Set(['cephalon', 'claude-code', 'github', 'tokenflux', 'yi'])

/** Providers retired from this build; their saved rows remain available to backups. */
export function isRetiredProvider(providerId: string | null | undefined, presetProviderId?: string | null): boolean {
  return (
    (providerId != null && RETIRED_PROVIDER_IDS.has(providerId)) ||
    (presetProviderId != null && RETIRED_PROVIDER_IDS.has(presetProviderId))
  )
}
