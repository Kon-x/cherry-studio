const fs = require('node:fs')
const semver = require('semver')
const { parse } = require('yaml')

function syncReleaseHistory({ builderPath, historyPath, version }) {
  if (semver.valid(version) !== version || version.includes('+')) {
    throw new Error(`Invalid release version: ${version}`)
  }
  if (semver.prerelease(version) && !/^\d+\.\d+\.\d+-kx\.[1-9]\d*$/.test(version)) return null

  const releaseNotes = parse(fs.readFileSync(builderPath, 'utf8')).releaseInfo?.releaseNotes
  if (typeof releaseNotes !== 'string' || !releaseNotes.trim()) {
    throw new Error('electron-builder.yml must contain non-empty releaseInfo.releaseNotes')
  }
  const history = JSON.parse(fs.readFileSync(historyPath, 'utf8')).filter((entry) => entry.version !== version)
  history.unshift({ version, releaseNotes })
  fs.writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`)

  return releaseNotes
}

function main() {
  const versionFlag = process.argv.indexOf('--target-version')
  const version = versionFlag >= 0 ? process.argv[versionFlag + 1] : undefined
  if (!version) throw new Error('--target-version is required')

  const synced = syncReleaseHistory({
    builderPath: 'electron-builder.yml',
    historyPath: 'resources/cherry-studio/release-history.json',
    version
  })
  console.log(synced ? `Synced release history for ${version}` : `Skipped release history for prerelease ${version}`)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { syncReleaseHistory }
