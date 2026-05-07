const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const projectRoot = path.resolve(__dirname, '..')
const logDir = path.join(projectRoot, 'log')
const legacyLogDir = path.join(logDir, 'legacy-dev')
const outLogPath = path.join(logDir, 'dev-out.log')
const errLogPath = path.join(logDir, 'dev-err.log')
const electronUserDataPath = path.join(process.env.APPDATA || '', 'neoresourcemanager')
const electronSessionDataPath = path.join(electronUserDataPath, 'sessionData')
const volatileSessionEntries = [
  'Cache',
  'Code Cache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'GPUCache',
  'Network'
]

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`
}

function moveFileSafe(sourcePath, targetPath) {
  try {
    fs.renameSync(sourcePath, targetPath)
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      const parsed = path.parse(targetPath)
      const dedupedTargetPath = path.join(parsed.dir, `${parsed.name}-${Date.now()}${parsed.ext}`)
      moveFileSafe(sourcePath, dedupedTargetPath)
      return
    }

    fs.copyFileSync(sourcePath, targetPath)
    fs.unlinkSync(sourcePath)
  }
}

function migrateLegacyRootLogs() {
  const legacyLogPattern = /^\.codex-dev-.*\.log$/i
  const rootEntries = fs.readdirSync(projectRoot, { withFileTypes: true })

  for (const entry of rootEntries) {
    if (!entry.isFile() || !legacyLogPattern.test(entry.name)) {
      continue
    }

    const sourcePath = path.join(projectRoot, entry.name)
    const targetPath = path.join(legacyLogDir, entry.name)
    moveFileSafe(sourcePath, targetPath)
  }
}

function clearVolatileElectronSessionData() {
  if (!electronSessionDataPath || !fs.existsSync(electronSessionDataPath)) {
    return
  }

  for (const entryName of volatileSessionEntries) {
    const targetPath = path.join(electronSessionDataPath, entryName)

    try {
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true })
      }
    } catch (error) {
      const message = `[${formatTimestamp()}] failed to clear session cache ${targetPath}: ${error?.stack || error?.message || String(error)}\n`
      process.stderr.write(message)
    }
  }
}

function createHeaderLine(label) {
  return `\n[${formatTimestamp()}] ${label}\n`
}

function resolveDevCommand() {
  const localBin = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite')

  if (fs.existsSync(localBin)) {
    if (process.platform === 'win32') {
      return {
        command: 'cmd.exe',
        args: ['/c', localBin, 'dev']
      }
    }

    return {
      command: localBin,
      args: ['dev']
    }
  }

  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/c', 'npx', 'electron-vite', 'dev']
    }
  }

  return {
    command: 'npx',
    args: ['electron-vite', 'dev']
  }
}

ensureDir(logDir)
ensureDir(legacyLogDir)
migrateLegacyRootLogs()
clearVolatileElectronSessionData()

fs.writeFileSync(outLogPath, createHeaderLine('electron-vite dev stdout'), 'utf8')
fs.writeFileSync(errLogPath, createHeaderLine('electron-vite dev stderr'), 'utf8')

const outStream = fs.createWriteStream(outLogPath, { flags: 'a' })
const errStream = fs.createWriteStream(errLogPath, { flags: 'a' })

const { command, args } = resolveDevCommand()
const child = spawn(command, args, {
  cwd: projectRoot,
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
  windowsHide: false,
  shell: false
})

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk)
  outStream.write(chunk)
})

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk)
  errStream.write(chunk)
})

child.on('error', (error) => {
  const message = `[${formatTimestamp()}] failed to start dev server: ${error?.stack || error?.message || String(error)}\n`
  process.stderr.write(message)
  errStream.write(message)
  outStream.end()
  errStream.end()
  process.exit(1)
})

child.on('close', (code, signal) => {
  const exitMessage = `[${formatTimestamp()}] dev process exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})\n`
  process.stdout.write(exitMessage)
  outStream.write(exitMessage)
  errStream.write(exitMessage)
  outStream.end()
  errStream.end()
  process.exit(code ?? 0)
})
