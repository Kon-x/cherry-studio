import type { WindowApiType } from '../../../src/preload/preload'
import { expect, test } from '../fixtures/electron.fixture'
import { startLocalServer } from '../fixtures/local-server'

test('provider login keeps its proxy, language, browser user agent and authorization callback', async ({
  electronApp,
  mainWindow
}) => {
  const server = await startLocalServer()
  const providerUrl = 'https://account.siliconflow.cn/oauth'
  try {
    await mainWindow.evaluate(async (proxyUrl) => {
      await (window as unknown as { api: WindowApiType }).api.preference.setMultiple({
        'app.proxy.mode': 'custom',
        'app.proxy.url': proxyUrl,
        'app.language': 'ja-JP'
      })
    }, server.url)
    await expect
      .poll(() => electronApp.evaluate(({ session }, url) => session.defaultSession.resolveProxy(url), providerUrl))
      .toBe(`PROXY ${new URL(server.url).host}`)
    await electronApp
      .context()
      .route(providerUrl, (route) => route.fulfill({ status: 302, headers: { location: `${server.url}/login` } }))
    const [login] = await Promise.all([
      mainWindow.waitForEvent('popup'),
      mainWindow.evaluate((url) => {
        window.open(url, '_blank')
      }, providerUrl)
    ])
    await expect(login.getByRole('heading', { name: 'Provider login fixture' })).toBeVisible()
    expect(
      await electronApp.evaluate(
        ({ BrowserWindow }, loginUrl) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.webContents.getURL() === loginUrl)!
            .webContents.session.resolveProxy('https://account.siliconflow.cn/oauth'),
        `${server.url}/login`
      )
    ).toBe(`PROXY ${new URL(server.url).host}`)
    const request = server.requests.find((request) => request.path === '/login')!
    expect(request.headers['accept-language']).toMatch(/^ja-JP/)
    expect(request.headers['user-agent']).not.toMatch(/Electron\/|CherryStudio\//)
    expect(await login.evaluate(() => typeof (window as unknown as { api?: unknown }).api)).toBe('undefined')
    await mainWindow.evaluate(() => {
      window.addEventListener(
        'message',
        (event) => {
          ;(window as unknown as { e2eLoginResult: unknown }).e2eLoginResult = event.data
        },
        { once: true }
      )
    })
    await login.evaluate(() => window.opener.postMessage('e2e-login-complete', '*'))
    await expect
      .poll(() => mainWindow.evaluate(() => (window as unknown as { e2eLoginResult: unknown }).e2eLoginResult))
      .toBe('e2e-login-complete')
    await login.close()
  } finally {
    await server.close()
  }
})
