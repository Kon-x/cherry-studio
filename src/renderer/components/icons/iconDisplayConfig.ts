import { getProviderIconAssetMetrics } from '@cherrystudio/ui/icons'

export interface IconDisplayConfig {
  scale: number
  borderRadius?: number
  viewBox?: string
}

export type IconDisplayContext = 'provider-list'

const providerListContainedIcon: IconDisplayConfig = { scale: 5 / 7, borderRadius: 5 }
const defaultIcon: IconDisplayConfig = { scale: 1.2 }

export function getIconDisplayConfig(
  context: IconDisplayContext,
  iconId: string | undefined
): IconDisplayConfig | undefined {
  if (!iconId) return undefined
  const normalizedIconId = iconId.toLowerCase()
  if (context === 'provider-list') {
    return normalizedIconId === 'litellm' ||
      normalizedIconId === 'radeon-cloud' ||
      getProviderIconAssetMetrics({ kind: 'provider', iconId }).kind === 'tile'
      ? providerListContainedIcon
      : defaultIcon
  }
  return defaultIcon
}
