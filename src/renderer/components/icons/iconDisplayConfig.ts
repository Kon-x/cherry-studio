export interface IconDisplayConfig {
  scale: number
  borderRadius?: number
}

export type IconDisplayContext = 'provider-list'

const providerListContainedIcon: IconDisplayConfig = { scale: 5 / 7, borderRadius: 5 }
const defaultIcon: IconDisplayConfig = { scale: 1.2 }

const ICON_DISPLAY_CONFIG: Readonly<Record<IconDisplayContext, Readonly<Record<string, IconDisplayConfig>>>> = {
  'provider-list': {
    cherryin: providerListContainedIcon,
    aihubmix: providerListContainedIcon,
    lmstudio: providerListContainedIcon,
    anthropic: providerListContainedIcon,
    yi: providerListContainedIcon,
    groq: providerListContainedIcon,
    'aws-bedrock': providerListContainedIcon,
    tokendance: providerListContainedIcon
  }
}

export function getIconDisplayConfig(
  context: IconDisplayContext,
  iconId: string | undefined
): IconDisplayConfig | undefined {
  if (!iconId) return undefined
  return ICON_DISPLAY_CONFIG[context][iconId.toLowerCase()] ?? defaultIcon
}
