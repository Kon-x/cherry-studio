import { appendFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { ElectronApplication, Page } from '@playwright/test'
import { _electron as electron, expect, test as base } from '@playwright/test'

import type { WindowApiType } from '../../../src/preload/preload'
import { uiLocator } from '../utils/ui-locator'

export type ElectronFixtures = {
  electronApp: ElectronApplication
  mainWindow: Page
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use, testInfo) => {
    const profile = await mkdtemp(path.join(os.tmpdir(), 'cherry-e2e-'))
    const roaming = path.join(profile, 'AppData', 'Roaming')
    const local = path.join(profile, 'AppData', 'Local')
    await Promise.all([
      mkdir(roaming, { recursive: true }),
      mkdir(local, { recursive: true }),
      mkdir(testInfo.outputDir, { recursive: true })
    ])
    const logPath = testInfo.outputPath('electron.log')
    const profileSuffix = path.basename(profile)
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      HOME: profile,
      USERPROFILE: profile,
      APPDATA: roaming,
      LOCALAPPDATA: local,
      XDG_CONFIG_HOME: profile,
      CS_DEV_USER_DATA_SUFFIX: profileSuffix
    }
    delete env.ELECTRON_RUN_AS_NODE
    const electronApp = await electron.launch({ args: ['.'], env, timeout: 60000 })
    const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
    expect(path.basename(userData)).toContain(profileSuffix)
    electronApp.process().stdout?.on('data', (chunk) => appendFileSync(logPath, chunk))
    electronApp.process().stderr?.on('data', (chunk) => appendFileSync(logPath, chunk))
    electronApp.on('window', (page) => {
      page.on('pageerror', (error) => appendFileSync(logPath, `Renderer error: ${error.stack}\n`))
    })
    await electronApp.context().tracing.start({ screenshots: true, snapshots: true, sources: true })

    try {
      await use(electronApp)
    } finally {
      const failed = testInfo.status !== testInfo.expectedStatus
      if (failed) {
        for (const [index, page] of electronApp.windows().entries()) {
          await page.screenshot({ path: testInfo.outputPath(`window-${index}.png`) }).catch((error) => {
            appendFileSync(logPath, `Screenshot failed: ${String(error)}\n`)
          })
          const body = await page
            .locator('body')
            .innerText()
            .catch(() => 'Window unavailable')
          appendFileSync(logPath, `\n${page.url()}\n${body}\n`)
        }
      }
      await electronApp.context().tracing.stop(failed ? { path: testInfo.outputPath('trace.zip') } : undefined)
      await electronApp.close()
      await rm(userData, { recursive: true, force: true, maxRetries: 3 })
      await rm(profile, { recursive: true, force: true, maxRetries: 3 })
    }
  },

  mainWindow: async ({ electronApp }, use) => {
    const isMainWindow = (page: Page) => page.url().includes('/windows/main/index.html')
    await expect.poll(() => electronApp.windows().some(isMainWindow), { timeout: 60000 }).toBe(true)
    const mainWindow = electronApp.windows().find(isMainWindow)!
    await mainWindow.waitForFunction(() => Boolean((window as unknown as { api: WindowApiType }).api?.preference))
    await mainWindow.evaluate(async () => {
      await (window as unknown as { api: WindowApiType }).api.preference.setMultiple({
        'app.language': 'en-US',
        'app.onboarding.provider_setup.status': 'skipped',
        'app.privacy.data_collection.enabled': false,
        'app.dist.auto_update.enabled': false,
        'app.proxy.mode': 'none'
      })
    })
    await mainWindow.reload()
    await expect(uiLocator(mainWindow, 'app.tab-bar')).toBeVisible({ timeout: 60000 })
    await use(mainWindow)
  }
})

export { expect } from '@playwright/test'
