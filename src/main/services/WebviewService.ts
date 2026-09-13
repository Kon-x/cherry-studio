import { BaseService, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import { getAppLanguage } from '@main/i18n'
import { session } from 'electron'

const WEBVIEW_PARTITION = 'persist:webview'

@Injectable('WebviewService')
@ServicePhase(Phase.WhenReady)
export class WebviewService extends BaseService {
  protected async onInit() {
    this.initSessionUserAgent()
  }

  /**
   * Initialize the useragent of the webview session.
   * Removes CherryStudio and Electron from the useragent.
   */
  private initSessionUserAgent() {
    const wvSession = session.fromPartition(WEBVIEW_PARTITION)
    const originUA = wvSession.getUserAgent()
    const newUA = originUA.replace(/CherryStudio\/\S+\s/, '').replace(/Electron\/\S+\s/, '')

    wvSession.setUserAgent(newUA)
    wvSession.webRequest.onBeforeSendHeaders((details, cb) => {
      const language = getAppLanguage()
      const headers = {
        ...details.requestHeaders,
        'User-Agent': details.url.includes('google.com') ? originUA : newUA,
        'Accept-Language': `${language}, en;q=0.9, *;q=0.5`
      }
      cb({ requestHeaders: headers })
    })
    this.registerDisposable(() => wvSession.webRequest.onBeforeSendHeaders(null))
  }
}
