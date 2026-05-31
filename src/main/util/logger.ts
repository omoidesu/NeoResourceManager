export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogFileAppender = (line: string) => void

let fileAppender: LogFileAppender | null = null
let fileAppenderFailureLogged = false

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
  if (payload instanceof Error) {
    return JSON.stringify({
      name: payload.name,
      message: payload.message,
      stack: payload.stack ?? ''
    })
  }

  try {
    return typeof payload === 'string' ? payload : JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

function writeLogToFile(line: string) {
  if (!fileAppender) {
    return
  }

  try {
    fileAppender(line)
  } catch (error) {
    if (fileAppenderFailureLogged) {
      return
    }

    fileAppenderFailureLogged = true
    console.error('[logger] failed to append log file', error)
  }
}

export function setLogFileAppender(appender: LogFileAppender | null) {
  fileAppender = appender
  fileAppenderFailureLogged = false
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
