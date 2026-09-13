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
  'src/main/ai/channels',
  'src/main/ai/agentSession',
  'src/main/ai/agents',
  'src/main/ai/skills',
  'src/main/ai/runtime/claudeCode',
  'src/main/ai/runtime/pi',
  'src/main/ai/runtime/dsh',
  'src/main/features/miniApp',
  'src/main/services/CodeCliService.ts',
  'src/main/services/DeepSeekHarnessService.ts',
  'src/main/services/OpenClawService.ts',
  'src/main/services/HermesService.ts',
  'packages/dsh-bridge',
  'packages/provider-registry/src/providers/claude-code.ts',
  'resources/builtin-agents',
  'resources/builtin-mini-apps',
  'resources/code-cli-skills',
  'resources/skills',
  'src/renderer/pages/agents',
  'src/renderer/pages/miniApps',
  'src/renderer/pages/code',
  'src/renderer/routes/app/agents.tsx',
  'src/renderer/routes/app/code.tsx',
  'src/renderer/routes/app/mini-app.index.tsx',
  'src/renderer/routes/app/mini-app',
  'src/renderer/routes/settings/skills.tsx',
  'src/renderer/routes/settings/scheduled-tasks.tsx',
  'docs/references/mini-app',
  'src/main/ipc/handlers/apiGateway.ts',
  'src/shared/ipc/schemas/apiGateway.ts',
  'src/shared/types/apiGateway.ts',
  'src/shared/utils/apiGateway.ts',
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

const removedServices = [
  'ApiGatewayService',
  'AgentSessionRuntimeService',
  'AgentJobsService',
  'SkillService',
  'ChannelManager',
  'MiniAppService',
  'CodeCliService',
  'DeepSeekHarnessService'
]
const sourceFiles = listFiles('src').filter((file) => /\.[cm]?[jt]sx?$/.test(file) && !file.includes('/__tests__/'))
for (const file of sourceFiles) {
  const source = read(file)
  const dependencies = [...source.matchAll(/@DependsOn\(\[([\s\S]*?)\]\)/g)].map((match) => match[1]).join('\n')
  for (const service of removedServices) {
    const lookup = new RegExp(`(?:application\\.get(?:Optional)?|@Injectable)\\(['"]${service}['"]`)
    if (lookup.test(source) || new RegExp(`['"]${service}['"]`).test(dependencies)) {
      failures.push(`${file} depends on the removed ${service}`)
    }
  }
}

const launchpadApps = [...read('src/renderer/utils/sidebar.ts').matchAll(/\bid: '([^']+)'/g)].map((match) => match[1])
if (
  JSON.stringify(launchpadApps) !==
  JSON.stringify(['assistants', 'paintings', 'translate', 'knowledge', 'files', 'notes'])
) {
  failures.push('The launchpad must contain only the six retained apps')
}

const dependencySources = `${read('package.json')}\n${read('pnpm-lock.yaml')}\n${read('pnpm-workspace.yaml')}`
for (const dependency of [
  '@larksuiteoapi/node-sdk',
  'grammy',
  'telegram-markdown-v2',
  '@anthropic-ai/claude-agent-sdk',
  '@earendil-works/pi-',
  '@deepseek-ai/dsh-',
  '@cherrystudio/dsh-bridge'
]) {
  if (dependencySources.includes(dependency)) failures.push(`${dependency} must stay removed`)
}

const lifecycle = read('src/main/core/application/serviceRegistry.ts')
for (const service of removedServices) {
  if (lifecycle.includes(service)) failures.push(`${service} must not be registered`)
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
