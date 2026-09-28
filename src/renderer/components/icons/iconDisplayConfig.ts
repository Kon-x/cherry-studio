import { getProviderIconAssetMetrics } from '@cherrystudio/ui/icons'

export interface IconDisplayConfig {
  scale: number
  borderRadius?: number
}

export type IconDisplayContext = 'provider-list'

const providerListContainedIcon: IconDisplayConfig = { scale: 5 / 7, borderRadius: 5 }
const defaultIcon: IconDisplayConfig = { scale: 1.2 }

export function getIconDisplayConfig(
  context: IconDisplayContext,
  iconId: string | undefined
): IconDisplayConfig | undefined {
  if (!iconId) return undefined
  if (context === 'provider-list') {
    return getProviderIconAssetMetrics({ kind: 'provider', iconId }).kind === 'tile'
      ? providerListContainedIcon
      : defaultIcon
  }
  return defaultIcon
}
