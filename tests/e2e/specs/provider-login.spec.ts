import type { WindowApiType } from '../../../src/preload/preload'
import { expect, test } from '../fixtures/electron.fixture'
import { startLocalServer } from '../fixtures/local-server'

test('provider login keeps its isolated session, proxy, language and browser user agent', async ({
  electronApp,
  mainWindow
}) => {
  const server = await startLocalServer()
  const providerUrl = 'https://account.siliconflow.cn/oauth'
  try {
    await mainWindow.evaluate(async (proxyUrl) => {
      await (window as unknown as { api: WindowApiType }).api.preference.setMultiple({
        'app.proxy.mode': 'custom',
        'app.proxy.url': proxyUrl
      })
    }, server.url)
    await expect
      .poll(() =>
        electronApp.evaluate(
          ({ session }, url) => session.fromPartition('persist:webview').resolveProxy(url),
          providerUrl
        )
      )
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
        ({ BrowserWindow, session }, loginUrl) =>
          BrowserWindow.getAllWindows().find((window) => window.webContents.getURL() === loginUrl)?.webContents
            .session === session.fromPartition('persist:webview'),
        `${server.url}/login`
      )
    ).toBe(true)
    const request = server.requests.find((request) => request.path === '/login')!
    expect(request.headers['accept-language']).toMatch(/^en-US/)
    expect(request.headers['user-agent']).not.toMatch(/Electron\/|CherryStudio\//)
    expect(await login.evaluate(() => typeof (window as unknown as { api?: unknown }).api)).toBe('undefined')
    await login.close()
  } finally {
    await server.close()
  }
})
