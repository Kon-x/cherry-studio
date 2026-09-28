import { describe, expect, it } from 'vitest'

import { getWebviewPartition, WEBVIEW_SECURITY_PARTITIONS, WebviewSecurityProfile } from '../webviewSecurity'

describe('webview security profiles', () => {
  it('keeps provider login persistent and HTML previews isolated without starting retired sessions', () => {
    expect(getWebviewPartition(WebviewSecurityProfile.ProviderLogin)).toBe('persist:webview')
    expect(getWebviewPartition(WebviewSecurityProfile.HtmlArtifactPreview)).toBe('html-artifact-preview')
    expect(Object.values(WEBVIEW_SECURITY_PARTITIONS)).toEqual(['persist:webview', 'html-artifact-preview'])
  })
})
