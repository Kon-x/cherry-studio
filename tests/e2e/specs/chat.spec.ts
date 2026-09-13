import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { Page } from '@playwright/test'

import { expect, test } from '../fixtures/chat.fixture'
import { dataRequest, ipcRequest } from '../utils/ipc'
import { uiLocator } from '../utils/ui-locator'

async function sendMessage(page: Page, message: string) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  const input = uiLocator(page, 'chat.composer')
    .filter({ visible: true })
    .locator('[data-ui~="part:composer-input"] [contenteditable="true"]')
  await input.fill(message)
  await input.press('Enter')
}

test('ordinary streamed chat remains readable after reloading', async ({ mainWindow, models }) => {
  await sendMessage(mainWindow, `Verify ordinary chat with ${models.chat.name}.`)
  const reply = uiLocator(mainWindow, 'chat.message-list')
    .filter({ visible: true })
    .getByText('Ordinary chat verification succeeded.', { exact: true })
  await expect(reply).toBeVisible({
    timeout: 30000
  })
  await expect(uiLocator(mainWindow, 'chat.composer.action.pause')).toHaveCount(0)
  await mainWindow.reload({ waitUntil: 'domcontentloaded' })
  await expect(reply).toBeVisible()
})

for (const decision of ['Allow', 'Deny'] as const) {
  test(`MCP ${decision.toLowerCase()} reaches the real approval and execution boundary`, async ({
    mainWindow,
    models
  }, testInfo) => {
    const callsPath = testInfo.outputPath('mcp-calls.jsonl')
    await writeFile(callsPath, '')
    const server = await dataRequest<{ id: string }>(mainWindow, 'POST', '/mcp-servers', {
      name: 'CI verification',
      type: 'stdio',
      command: process.execPath,
      args: [path.resolve('tests/e2e/fixtures/mcp-server.mjs')],
      env: { E2E_MCP_CALLS_FILE: callsPath },
      isActive: true,
      isTrusted: true,
      disabledAutoApproveTools: ['verify_connection']
    })
    await dataRequest(mainWindow, 'PATCH', `/assistants/${models.assistant.id}`, {
      mcpServerIds: [server.id],
      settings: { mcpMode: 'manual' }
    })
    expect(await ipcRequest(mainWindow, 'mcp.server.check_connectivity', { serverId: server.id })).toBe(true)
    await ipcRequest(mainWindow, 'mcp.server.refresh_tools', { serverId: server.id })
    await sendMessage(mainWindow, 'Use the verification MCP tool.')
    const allow = mainWindow.getByRole('button', { name: 'Allow', exact: true })
    await expect(allow).toBeVisible({ timeout: 30000 })
    expect(await readFile(callsPath, 'utf8')).toBe('')
    await mainWindow.getByRole('button', { name: decision, exact: true }).click()

    const reply = decision === 'Allow' ? 'MCP verified after approval.' : 'MCP request was denied.'
    await expect(
      uiLocator(mainWindow, 'chat.message-list').filter({ visible: true }).getByText(reply, { exact: true })
    ).toBeVisible({
      timeout: 30000
    })
    const calls = await readFile(callsPath, 'utf8')
    expect(
      calls
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    ).toEqual(decision === 'Allow' ? [{ value: 'ordinary-chat-mcp' }] : [])
  })
}

test('chat HTML renders in the retained preview surface', async ({ mainWindow, models }) => {
  await sendMessage(mainWindow, `Return the HTML preview fixture using ${models.chat.name}.`)
  await expect(
    mainWindow
      .frameLocator('iframe[title="Retained HTML preview"]')
      .getByRole('heading', { name: 'HTML preview is working' })
  ).toBeVisible({ timeout: 30000 })
})
