const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { schemas } = require('../../electron/ipc-validation.cjs')
const { validateReleaseConfig } = require('../../check-release.cjs')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('main-process handlers, validation schemas, and preload methods expose the same IPC channels', () => {
  const main = read('electron/main.cjs')
  const preload = read('electron/preload.cjs')
  const handlers = new Set([...main.matchAll(/handle\(['"]([^'"]+)/g)].map((match) => match[1]))
  const exposed = new Set([...preload.matchAll(/invoke\(['"]([^'"]+)/g)].map((match) => match[1]))
  const validated = new Set(Object.keys(schemas))

  assert.deepEqual([...handlers].sort(), [...validated].sort())
  assert.deepEqual([...handlers].sort(), [...exposed].sort())
})

test('Electron renderer privileges remain locked down', () => {
  const main = read('electron/main.cjs')
  assert.match(main, /contextIsolation:\s*true/)
  assert.match(main, /nodeIntegration:\s*false/)
  assert.match(main, /sandbox:\s*true/)
  assert.match(main, /webSecurity:\s*true/)
  assert.match(main, /setPermissionRequestHandler\([\s\S]*callback\(false\)/)
  assert.match(main, /setWindowOpenHandler/)
  assert.match(main, /will-navigate/)
})

test('auto-update only starts for a packaged application with release metadata', () => {
  const main = read('electron/main.cjs')
  assert.match(main, /app\.isPackaged/)
  assert.match(main, /app-update\.yml/)
  assert.match(main, /fs\.existsSync\(updateConfig\)/)
})

test('release preflight rejects placeholders and version-tag mismatches', () => {
  const valid = { repository: { url: 'https://github.com/gitvista-app/gitvista.git' }, version: '1.2.3' }
  // Pass an explicit environment so a tag build's GITHUB_REF variables do not leak in.
  assert.equal(validateReleaseConfig(valid, {}), 'https://github.com/gitvista-app/gitvista.git')
  assert.throws(
    () => validateReleaseConfig({ ...valid, repository: { url: 'https://github.com/your-org/gitvista.git' } }, {}),
    /placeholder/i
  )
  assert.throws(
    () => validateReleaseConfig(valid, { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.2.4' }),
    /must match package version/i
  )
  assert.equal(validateReleaseConfig(valid, { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.2.3' }), 'https://github.com/gitvista-app/gitvista.git')
})

test('every CSS custom property either exists or has a fallback', () => {
  const css = read('src/styles.css')
  const definitions = new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map((match) => match[1]))
  const missing = []
  for (const match of css.matchAll(/var\(--([\w-]+)([^)]*)\)/g)) {
    if (!definitions.has(match[1]) && !match[2].includes(',')) missing.push(match[1])
  }
  assert.deepEqual([...new Set(missing)].sort(), [])
})

test('an operation is reported to the activity log only after it holds the mutation gate', () => {
  const main = read('electron/main.cjs')
  const wrapper = main.slice(main.indexOf('const handle = (channel, fn) =>'), main.indexOf("handle('repo:choose'"))
  assert.match(wrapper, /runMutation\([^,]+,\s*\(\)\s*=>\s*\{\s*operation = operationStarted\(channel\)/)
  assert.equal(wrapper.match(/operationStarted\(/g).length, 1)
})

test('renderer handlers that start Git work refuse to run while another operation is busy', () => {
  const app = read('src/App.jsx')
  const handlers = [
    'async function doInit(dir) {',
    'async function openSandbox() {',
    'async function createPR({ url, needsPush }) {',
    'async function doClone({ url, dir, name }) {',
    'const onOpenFile = async (file) => {',
    'async function doAddRemote({ name, url }) {',
    'async function updateUpstream(branch, upstream) {',
    'async function unsetUpstream(branch) {',
    'async function createWorktree({ parentDir, folderName, ref, newBranch, openAfter }) {',
  ]
  for (const handler of handlers) {
    const start = app.indexOf(handler)
    assert.notEqual(start, -1, handler)
    const body = app.slice(start + handler.length, app.indexOf('setBusy(true)', start))
    assert.match(body, /if \(busyRef\.current\) return/, handler)
  }
})

test('the command palette shares dialog focus handling and global shortcuts register once', () => {
  const palette = read('src/components/CommandPalette.jsx')
  assert.match(palette, /<ModalOverlay className="command-overlay" onClick=\{onClose\}>/)
  const app = read('src/App.jsx')
  assert.match(app, /const onShortcut = \(event\) => shortcutHandler\.current\?\.\(event\)[\s\S]*?\}, \[\]\)/)
})
