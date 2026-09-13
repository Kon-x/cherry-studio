import fs from 'node:fs'
import path from 'node:path'

import { extractFile, listPackage } from '@electron/asar'

const retiredPaths = [
  /(?:^|\/)node_modules\/(?:@anthropic-ai\/claude-agent-sdk(?:-[^/]+)?|@earendil-works\/pi-[^/]+|@deepseek-ai\/(?:dsh-|node-addon-landlock-run)[^/]*|@cherrystudio\/dsh-bridge|@larksuiteoapi\/node-sdk|grammy|telegram-markdown-v2)(?:\/|$)/,
  /^(?:app\.asar\.unpacked\/)?(?:resources\/)?(?:builtin-agents|builtin-mini-apps|code-cli-skills|skills|dsh-runtime)(?:\/|$)/,
  /^out\/preload\/miniApp(?:Bridge)?\.js$/,
  /^out\/main\/assets\/miniAppTheme\.css$/
]
const retiredRuntime =
  /\b(?:ClaudeCodeRuntimeDriver|PiRuntimeDriver|DshRuntimeDriver|AgentSessionRuntimeService|AgentSessionDeliveryService|AgentJobsService|MiniAppRuntimeService|CodeCliService|DeepSeekHarnessService|OpenClawService|HermesDashboardService|SkillService|ChannelManager|ApiGatewayService)\b/

export function checkRetiredPackage(resourcesDirectory: string) {
  const archive = path.join(resourcesDirectory, 'app.asar')
  const entries = listPackage(archive, { isPack: false }).map((entry) => entry.replaceAll('\\', '/').replace(/^\/+/, ''))
  const externalFiles = fs
    .readdirSync(resourcesDirectory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(resourcesDirectory, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
  const failures = [...entries, ...externalFiles].filter((entry) => retiredPaths.some((pattern) => pattern.test(entry)))

  for (const required of ['out/main/main.js', 'out/preload/preload.js', 'out/renderer/windows/main/index.html']) {
    if (!entries.includes(required)) failures.push(`Missing application entry: ${required}`)
  }

  const bundles = entries.filter((entry) => /^out\/.*\.js$/.test(entry))
  for (const entry of bundles) {
    const match = extractFile(archive, entry).toString('utf8').match(retiredRuntime)
    if (match) failures.push(`${entry}: ${match[0]}`)
  }

  if (failures.length > 0) throw new Error(`Retired package content check failed:\n${failures.join('\n')}`)
  return { archiveEntries: entries.length, externalFiles: externalFiles.length, scannedBundles: bundles.length }
}

if (require.main === module) {
  const resourcesDirectory = process.argv[2]
  if (!resourcesDirectory) throw new Error('Usage: tsx scripts/check-retired-package.ts <resources-directory>')
  process.stdout.write(`${JSON.stringify(checkRetiredPackage(path.resolve(resourcesDirectory)), null, 2)}\n`)
}
