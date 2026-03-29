export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function formatNow() {
  const now = new Date()
  const pad = (value: number, size = 2) => String(value).padStart(size, '0')

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
    + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.`
    + `${pad(now.getMilliseconds(), 3)}`
}

function writeLog(scope: string, level: LogLevel, message: string, payload?: unknown) {
  const prefix = `[${formatNow()}] [${scope}] [${level.toUpperCase()}] ${message}`
  const serializedPayload = payload === undefined
    ? ''
    : ` ${safeSerializePayload(payload)}`
  const line = `${prefix}${serializedPayload}`

  writeLogToFile(line)

  switch (level) {
    case 'error':
      if (payload !== undefined) {
        console.error(prefix, payload)
        return
      }
      console.error(prefix)
      return
    case 'warn':
      if (payload !== undefined) {
        console.warn(prefix, payload)
        return
      }
      console.warn(prefix)
      return
    default:
      if (payload !== undefined) {
        console.log(prefix, payload)
        return
      }
      console.log(prefix)
  }
}

function safeSerializePayload(payload: unknown) {
  try {
    return typeof payload === 'string' ? payload : JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

function writeLogToFile(line: string) {
  try {
    const nodeRequire = getNodeRequire()
    if (!nodeRequire) {
      return
    }

    const fs = nodeRequire('fs') as typeof import('fs')
    const path = nodeRequire('path') as typeof import('path')
    const { app } = nodeRequire('electron') as typeof import('electron')

    if (!app?.isReady?.()) {
      return
    }

    const logDir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(path.join(logDir, 'main.log'), `${line}\n`, 'utf8')
  } catch {
    // noop
  }
}

function getNodeRequire() {
  try {
    if (typeof window !== 'undefined') {
      return null
    }

    return Function('return require')() as NodeJS.Require
  } catch {
    return null
  }
}

export function createLogger(scope: string) {
  return {
    debug(message: string, payload?: unknown) {
      writeLog(scope, 'debug', message, payload)
    },
    info(message: string, payload?: unknown) {
      writeLog(scope, 'info', message, payload)
    },
    warn(message: string, payload?: unknown) {
      writeLog(scope, 'warn', message, payload)
    },
    error(message: string, payload?: unknown) {
      writeLog(scope, 'error', message, payload)
    },
  }
}
