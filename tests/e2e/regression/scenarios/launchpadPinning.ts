import { writeFile } from 'node:fs/promises'

import { expect, type Page, type TestInfo } from '@playwright/test'

import { getSensitiveConfigValues } from '../../../../scripts/e2e/regression/config'
import { captureMaskedScreenshot } from '../../../../scripts/e2e/regression/screenshotEvidence'
import { openLaunchpad } from '../helpers/navigation'
import type { RegressionApp } from '../RegressionApp'

export async function launchpadPinning(app: RegressionApp, page: Page, testInfo: TestInfo): Promise<void> {
  const previous = await page.evaluate(async () => ({
    shortcuts: await window.api.preference.get('ui.sidebar_shortcut'),
    menu: await window.api.preference.get('menu.presentation_mode')
  }))
  const screenshot = async (name: string) => {
    const path = testInfo.outputPath(`${name}.png`)
    await writeFile(path, await captureMaskedScreenshot(page, getSensitiveConfigValues()))
    await testInfo.attach(name, { path, contentType: 'image/png' })
  }
  const sidebarButton = () =>
    page.locator('[data-ui~="app.sidebar"]').getByRole('button', { name: 'Notes', exact: true })
  const appsSection = () =>
    page.locator('section').filter({ has: page.getByRole('heading', { name: 'Apps', exact: true }) })
  const tile = () => appsSection().getByRole('button', { name: 'Notes', exact: true })
  const isPinned = () =>
    page.evaluate(async () =>
      (await window.api.preference.get('ui.sidebar_shortcut')).some(
        ({ target }) => target.locator.providerId === 'core.app' && target.locator.resourceId === 'notes'
      )
    )
  const toggleSidebar = async (pin: boolean) => {
    await tile().click({ button: 'right' })
    await page.getByRole('menuitem', { name: pin ? 'Add to Sidebar' : 'Remove from Sidebar', exact: true }).click()
    await expect.poll(isPinned).toBe(pin)
    if (pin) await expect(sidebarButton()).toBeVisible()
    else await expect(sidebarButton()).toHaveCount(0)
    await expect(tile()).toBeVisible()
  }

  try {
    await page.evaluate(async (shortcuts) => {
      await window.api.preference.setMultiple({
        'menu.presentation_mode': 'cherry',
        'ui.sidebar_shortcut': shortcuts.filter(
          ({ target }) => !(target.locator.providerId === 'core.app' && target.locator.resourceId === 'notes')
        )
      })
    }, previous.shortcuts)
    await page.reload()
    await openLaunchpad(page)
    await expect(tile()).toBeVisible()
    await expect(sidebarButton()).toHaveCount(0)

    await toggleSidebar(true)
    await screenshot('MP-130 Notes pinned from launchpad')
    await toggleSidebar(false)
    await toggleSidebar(true)
    await tile().click()
    await expect(page.locator('[data-ui~="notes.view"]:visible')).toBeVisible()
    await screenshot('MP-130 Notes opened from launchpad')

    page = await app.restart()
    await openLaunchpad(page)
    await expect(sidebarButton()).toBeVisible()
    expect(await isPinned()).toBe(true)
    await expect(tile()).toBeVisible()
    await screenshot('MP-130 pinned state survives application restart')

    await toggleSidebar(false)
    page = await app.restart()
    await openLaunchpad(page)
    await expect(tile()).toBeVisible()
    await expect(sidebarButton()).toHaveCount(0)
    expect(await isPinned()).toBe(false)
    await screenshot('MP-130 unpinned state survives application restart')
  } finally {
    await page.evaluate(async (previous) => {
      await window.api.preference.setMultiple({
        'menu.presentation_mode': previous.menu,
        'ui.sidebar_shortcut': previous.shortcuts
      })
    }, previous)
  }
}
