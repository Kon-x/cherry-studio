export const WebviewSecurityProfile = {
  ProviderLogin: 'provider-login',
  HtmlArtifactPreview: 'html-artifact-preview'
} as const

export type WebviewSecurityProfile = (typeof WebviewSecurityProfile)[keyof typeof WebviewSecurityProfile]

export const WEBVIEW_SECURITY_PARTITIONS = {
  [WebviewSecurityProfile.ProviderLogin]: 'persist:webview',
  [WebviewSecurityProfile.HtmlArtifactPreview]: 'html-artifact-preview'
} as const satisfies Record<WebviewSecurityProfile, string>

export type WebviewSecurityPartition = (typeof WEBVIEW_SECURITY_PARTITIONS)[WebviewSecurityProfile]

export function getWebviewPartition(profile: WebviewSecurityProfile): WebviewSecurityPartition {
  return WEBVIEW_SECURITY_PARTITIONS[profile]
}

export function getWebviewSecurityProfile(partition: string): WebviewSecurityProfile | undefined {
  return (
    Object.entries(WEBVIEW_SECURITY_PARTITIONS) as Array<[WebviewSecurityProfile, WebviewSecurityPartition]>
  ).find(([, candidate]) => candidate === partition)?.[0]
}
