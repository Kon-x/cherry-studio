import { installProviderUserAgentInterceptor } from '@main/ai/utils/customFetch'
import { BaseService, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import { getAppLanguage } from '@main/i18n'
import type { WebContents } from 'electron'
import { session } from 'electron'

const WEBVIEW_PARTITION = 'persist:webview'

function browserUserAgent(userAgent: string): string {
  return userAgent.replace(/CherryStudio\/\S+\s/, '').replace(/Electron\/\S+\s/, '')
}

@Injectable('WebviewService')
@ServicePhase(Phase.WhenReady)
export class WebviewService extends BaseService {
  private readonly popupUserAgents = new WeakMap<WebContents, string>()

  protected async onInit() {
    this.initSessionUserAgent()
    this.registerDisposable(
      installProviderUserAgentInterceptor((details) => {
        const originUA = details.webContents && this.popupUserAgents.get(details.webContents)
        return originUA ? this.browserHeaders(details.url, originUA) : undefined
      })
    )
  }

  configureProviderPopup(contents: WebContents): void {
    const originUA = contents.getUserAgent()
    this.popupUserAgents.set(contents, originUA)
    contents.setUserAgent(browserUserAgent(originUA))
  }

  private browserHeaders(url: string, originUA: string): Record<string, string> {
    return {
      'User-Agent': url.includes('google.com') ? originUA : browserUserAgent(originUA),
      'Accept-Language': `${getAppLanguage()}, en;q=0.9, *;q=0.5`
    }
  }

  /**
   * Initialize the useragent of the webview session.
   * Removes CherryStudio and Electron from the useragent.
   */
  private initSessionUserAgent() {
    const wvSession = session.fromPartition(WEBVIEW_PARTITION)
    const originUA = wvSession.getUserAgent()
    const newUA = browserUserAgent(originUA)

    wvSession.setUserAgent(newUA)
    wvSession.webRequest.onBeforeSendHeaders((details, cb) => {
      const headers = {
        ...details.requestHeaders,
        ...this.browserHeaders(details.url, originUA)
      }
      cb({ requestHeaders: headers })
    })
    this.registerDisposable(() => wvSession.webRequest.onBeforeSendHeaders(null))
  }
}
