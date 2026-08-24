import fs from 'node:fs'
import path from 'node:path'

const repositoryRoot = path.resolve(__dirname, '..')
const failures: string[] = []

function repositoryPath(relativePath: string): string {
  return path.join(repositoryRoot, relativePath)
}

function assertRemoved(relativePath: string): void {
  const target = repositoryPath(relativePath)
  if (!fs.existsSync(target)) return

  const isEmptyDirectory = fs.statSync(target).isDirectory() && listFiles(relativePath).length === 0
  if (!isEmptyDirectory) failures.push(`${relativePath} must stay removed`)
}

function read(relativePath: string): string {
  return fs.readFileSync(repositoryPath(relativePath), 'utf8')
}

function listFiles(relativePath: string): string[] {
  const directory = repositoryPath(relativePath)
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? listFiles(path.join(relativePath, entry.name))
        : [path.join(relativePath, entry.name).replaceAll('\\', '/')]
    )
}

for (const relativePath of [
  'docs/references/api-gateway',
  'src/main/features/apiGateway',
  'src/main/ai/channels/adapters',
  'src/main/ai/channels/ChannelLogBuffer.ts',
  'src/main/ai/channels/ChannelMessageHandler.ts',
  'src/main/ai/channels/FlushController.ts',
  'src/main/ipc/handlers/apiGateway.ts',
  'src/main/ipc/handlers/channel.ts',
  'src/shared/ipc/schemas/channel.ts',
  'src/renderer/pages/settings/ChannelsSettings',
  'src/renderer/pages/settings/ToolSettings/ApiGatewaySettings',
  'src/renderer/routes/settings/api-gateway.tsx',
  'src/renderer/routes/settings/channels.tsx',
  '.github/dependabot.yml'
]) {
  assertRemoved(relativePath)
}

const sourceFiles = listFiles('src').filter((file) => /\.[cm]?[jt]sx?$/.test(file))
for (const file of sourceFiles) {
  const source = read(file)
  if (/application\.get(?:Optional)?\(['"]ApiGatewayService['"]\)/.test(source)) {
    failures.push(`${file} looks up the removed ApiGatewayService`)
  }
}

const channelManager = read('src/main/ai/channels/ChannelManager.ts')
for (const [description, pattern] of [
  ['syncChannel must remain inert', /async syncChannel\([\s\S]*?\): Promise<void> \{\}/],
  ['getAgentAdapters must return no adapters', /getAgentAdapters\([\s\S]*?return \[\]/],
  ['getAdapter must return undefined', /getAdapter\([\s\S]*?return undefined/],
  ['getAllStatuses must return no statuses', /getAllStatuses\([\s\S]*?return \[\]/]
] as const) {
  if (!pattern.test(channelManager)) failures.push(description)
}

const dependencySources = `${read('package.json')}\n${read('pnpm-lock.yaml')}`
for (const dependency of ['@larksuiteoapi/node-sdk', 'grammy', 'telegram-markdown-v2']) {
  if (dependencySources.includes(dependency)) failures.push(`${dependency} must stay removed`)
}

const workflowFiles = fs.readdirSync(repositoryPath('.github/workflows')).sort()
const expectedWorkflows = ['build-windows.yml', 'checks.yml']
if (JSON.stringify(workflowFiles) !== JSON.stringify(expectedWorkflows)) {
  failures.push(`.github/workflows must contain only ${expectedWorkflows.join(', ')}`)
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`fork invariant failed: ${failure}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('Fork invariants passed.\n')
}
