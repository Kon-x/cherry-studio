import { expect, test } from '../fixtures/electron.fixture'
import { uiLocator } from '../utils/ui-locator'

test('fresh profiles open Chat and the launchpad offers only the six retained apps', async ({ mainWindow }) => {
  await expect(uiLocator(mainWindow, 'chat.composer')).toBeVisible()
  await uiLocator(mainWindow, 'app.tab-bar').getByRole('button', { name: 'Launchpad', exact: true }).click()
  const apps = mainWindow
    .locator('section')
    .filter({ has: mainWindow.getByRole('heading', { name: 'Apps', exact: true }) })

  // Sortable also exposes a button role on each tile's keyboard activator.
  await expect(apps.getByRole('button').and(apps.locator('button'))).toHaveText([
    'Conversations',
    'Paintings',
    'Translation',
    'Knowledge Base',
    'Files',
    'Notes'
  ])
  await apps.getByRole('button', { name: 'Conversations', exact: true }).and(apps.locator('button')).click()
  await expect(uiLocator(mainWindow, 'chat.composer')).toBeVisible()
})

test('help actions hand their destinations to the system browser', async ({ electronApp, mainWindow }) => {
  await electronApp.evaluate(({ shell }) => {
    const state = globalThis as typeof globalThis & { e2eExternalUrls: string[] }
    state.e2eExternalUrls = []
    shell.openExternal = async (url) => {
      state.e2eExternalUrls.push(url)
    }
  })
  for (const label of ['User guide', "What's new", 'Star us on GitHub']) {
    await mainWindow.getByRole('button', { name: 'Help', exact: true }).click()
    await mainWindow.getByText(label, { exact: true }).click()
  }

  await expect
    .poll(() =>
      electronApp.evaluate(() => (globalThis as typeof globalThis & { e2eExternalUrls: string[] }).e2eExternalUrls)
    )
    .toEqual([
      'https://docs.cherryai.com.cn/docs/en-us',
      'https://github.com/Kon-x/cherry-studio/releases',
      'https://github.com/CherryHQ/cherry-studio'
    ])
})
