const fs = require('node:fs')
const path = require('node:path')

function validateReleaseConfig(packageJson, environment = process.env) {
  const repository = typeof packageJson.repository === 'string' ? packageJson.repository : packageJson.repository?.url
  let repositoryUrl
  try {
    repositoryUrl = new URL(String(repository || '').replace(/^git\+/, ''))
  } catch {
    throw new Error('Release configuration is incomplete: package.json needs a valid GitHub repository URL.')
  }

  const placeholder = /(^|\/)(your-org|your-name|example)(\/|$)/i.test(repositoryUrl.pathname)
  const canonicalPath = /^\/[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+(?:\.git)?\/?$/.test(repositoryUrl.pathname)
  if (
    repositoryUrl.protocol !== 'https:' ||
    repositoryUrl.hostname !== 'github.com' ||
    repositoryUrl.port ||
    repositoryUrl.username ||
    repositoryUrl.password ||
    repositoryUrl.search ||
    repositoryUrl.hash ||
    placeholder ||
    !canonicalPath
  ) {
    throw new Error('Release configuration is incomplete: replace the placeholder package.json repository with the real HTTPS GitHub URL.')
  }

  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.version || '')) {
    throw new Error('Release configuration is incomplete: package.json needs a valid semantic version.')
  }

  if (environment.GITHUB_REF_TYPE === 'tag') {
    const expectedTag = `v${packageJson.version}`
    if (environment.GITHUB_REF_NAME !== expectedTag) {
      throw new Error(`Release configuration is inconsistent: tag ${environment.GITHUB_REF_NAME || '(missing)'} must match package version ${expectedTag}.`)
    }
  }

  return repositoryUrl.toString()
}

if (require.main === module) {
  try {
    const packagePath = path.join(__dirname, 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    console.log(`Release configuration is ready for ${validateReleaseConfig(packageJson)}.`)
  } catch (error) {
    console.error(error?.message || String(error))
    process.exitCode = 1
  }
}

module.exports = { validateReleaseConfig }
