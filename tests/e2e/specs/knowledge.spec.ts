import { expect, test } from '../fixtures/chat.fixture'
import { dataRequest, ipcRequest } from '../utils/ipc'
import { uiLocator } from '../utils/ui-locator'

test('knowledge indexes a note with the local embedding model and retrieves its text in the UI', async ({
  mainWindow,
  models,
  localServer
}) => {
  const base = await ipcRequest<{ id: string }>(mainWindow, 'knowledge.create_base', {
    base: { name: 'CI knowledge', embeddingModelId: models.embedding.id, dimensions: 8 }
  })
  await ipcRequest(mainWindow, 'knowledge.add_items', {
    baseId: base.id,
    items: [
      {
        type: 'note',
        data: { source: 'Verification note', content: 'The verification passphrase is cherry-orchard-42.' }
      }
    ]
  })
  await expect
    .poll(
      async () => {
        const result = await dataRequest<{ items: Array<{ status: string }> }>(
          mainWindow,
          'GET',
          `/knowledge-bases/${base.id}/items`
        )
        return result.items.map((item) => item.status)
      },
      { timeout: 30000 }
    )
    .toEqual(['completed'])

  await uiLocator(mainWindow, 'app.tab-bar').getByRole('button', { name: 'Launchpad', exact: true }).click()
  const apps = mainWindow
    .locator('section')
    .filter({ has: mainWindow.getByRole('heading', { name: 'Apps', exact: true }) })
  await apps.getByRole('button', { name: 'Knowledge Base', exact: true }).and(apps.locator('button')).click()
  await mainWindow.getByRole('button', { name: 'CI knowledge', exact: true }).click()
  await mainWindow.getByRole('button', { name: 'Recall Test', exact: true }).click()
  await mainWindow.getByPlaceholder('Enter test query...').fill('What is the verification passphrase?')
  await mainWindow.getByPlaceholder('Enter test query...').press('Enter')

  await expect(mainWindow.getByText('The verification passphrase is cherry-orchard-42.', { exact: true })).toBeVisible({
    timeout: 30000
  })
  expect(localServer.requests.filter((request) => request.path === '/v1/embeddings').length).toBeGreaterThanOrEqual(2)
})
