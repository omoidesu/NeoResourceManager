import express, { type NextFunction, type Request, type Response } from 'express'
import type { Server } from 'http'
import { app as electronApp } from 'electron'
import { DatabaseService } from '../service/database.service'
import { createLogger } from '../util/logger'
import { Settings } from '../../common/constants'

type ApiResponse<T> = {
  code: number
  message: string
  data: T
}

type StatusResponse = {
  version: string
  resources: {
    total: number
    types: Array<{
      id: string
      name: string
      emoji: string
      pillColor: string
      sort: number
      count: number
    }>
  }
}

const logger = createLogger('api')
const API_HOST = '127.0.0.1'

function ok<T>(data: T, message = ''): ApiResponse<T> {
  return {
    code: 200,
    message,
    data
  }
}

function normalizePort(input: unknown) {
  const port = Math.floor(Number(input))
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return Number(Settings.API_PORT.default)
  }

  return port
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next)
  }
}

export class ApiServer {
  private static server: Server | null = null
  private static port: number | null = null

  static async start() {
    if (this.server) {
      return
    }

    const portSetting = await DatabaseService.getSetting(Settings.API_PORT)
    const port = normalizePort(portSetting?.value ?? Settings.API_PORT.default)
    await this.startOnPort(port)
  }

  private static async startOnPort(port: number) {
    const api = express()

    api.disable('x-powered-by')
    api.use(express.json())

    api.get('/api/v1/status', asyncRoute(async (_req, res) => {
      const resources = await DatabaseService.getApiStatusResourceSummary()

      res.json(ok<StatusResponse>({
        version: electronApp.getVersion(),
        resources
      }))
    }))

    api.use((_req, res) => {
      res.status(404).json(ok(null, 'Not Found'))
    })

    api.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      logger.error('api request failed', error)
      res.status(500).json({
        code: 500,
        message: error instanceof Error ? error.message : 'Internal Server Error',
        data: {}
      })
    })

    await new Promise<void>((resolve, reject) => {
      const server = api.listen(port, API_HOST, () => {
        this.server = server
        this.port = port
        logger.info('api server started', { host: API_HOST, port })
        resolve()
      })

      server.on('error', reject)
    })
  }

  static async restart() {
    const portSetting = await DatabaseService.getSetting(Settings.API_PORT)
    const nextPort = normalizePort(portSetting?.value ?? Settings.API_PORT.default)

    if (this.server && this.port === nextPort) {
      logger.info('api server restart skipped, port unchanged', { port: nextPort })
      return {
        host: API_HOST,
        port: nextPort,
        restarted: false
      }
    }

    await this.stop()
    await this.startOnPort(nextPort)

    return {
      host: API_HOST,
      port: nextPort,
      restarted: true
    }
  }

  static async stop() {
    const server = this.server
    if (!server) {
      return
    }

    await new Promise<void>((resolve) => {
      server.close((error) => {
        if (error) {
          logger.error('failed to stop api server', error)
        }
        resolve()
      })
    })

    logger.info('api server stopped', { port: this.port })
    this.server = null
    this.port = null
  }
}
