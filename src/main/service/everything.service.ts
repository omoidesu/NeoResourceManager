import { spawnSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import axios from 'axios'
import { DatabaseService } from './database.service'
import { Settings } from '../../common/constants'
import { createLogger } from '../util/logger'

const logger = createLogger('everything-http')

function isMarkerFileNameMatched(fileName: string, resourceId: string) {
  return fileName === resourceId || fileName === `.${resourceId}`
}

export type EverythingClientInfo = {
  available: boolean
  mode: 'http' | 'cli' | ''
  cliPath: string
  baseUrl: string
  username: string
  password: string
}

type EverythingInstallInfo = {
  installed: boolean
  installDir: string
  everythingExePath: string
}

export class EverythingService {
  /**
   * 检测 Everything 可用性。
   * 先确认当前机器上是否已安装 Everything，再按 HTTP -> CLI 的顺序检查可用性。
   */
  static async detectClient(): Promise<EverythingClientInfo> {
    const installInfo = this.detectInstallation()
    if (!installInfo.installed) {
      logger.warn('everything is not installed on current machine')
      return this.createUnavailableClient()
    }

    const httpEnabled = await this.isSettingEnabled(Settings.USE_EVERYTHING_HTTP)
    if (httpEnabled) {
      const httpClient = await this.detectHttpClient()
      if (httpClient.available) {
        logger.info('detected available everything http client', {
          baseUrl: httpClient.baseUrl,
        })
        return httpClient
      }
    }

    const cliClient = this.detectCliClient(installInfo)
    if (cliClient.available) {
      logger.info('detected available everything cli client', {
        cliPath: cliClient.cliPath,
      })
      return cliClient
    }

    logger.warn('everything is installed but no available http or cli client was found', {
      installDir: installInfo.installDir || null,
      everythingExePath: installInfo.everythingExePath || null,
    })
    return this.createUnavailableClient()
  }

  /**
   * 使用 Everything 搜索 marker 文件路径。
   * 返回的结果会在上层进一步过滤为 .nrm/<resourceId> 格式。
   */
  static async searchMarkerPaths(client: EverythingClientInfo, resourceId: string) {
    if (!client.available) {
      return []
    }

    if (client.mode === 'http') {
      return this.searchMarkerPathsByHttp(client, resourceId)
    }

    if (client.mode === 'cli') {
      return this.searchMarkerPathsByCli(client, resourceId)
    }

    return []
  }

  /**
   * 检测当前系统是否可用 Everything CLI。
   * 这里只基于已安装的 Everything 目录推导 es.exe，
   * 不把单独存在的 es.exe 视为 Everything 已安装。
   */
  static detectCliClient(installInfo?: EverythingInstallInfo): EverythingClientInfo {
    const candidates = [
      installInfo?.installDir ? path.join(installInfo.installDir, 'es.exe') : '',
      'C:\\Program Files\\Everything\\es.exe',
      'C:\\Program Files (x86)\\Everything\\es.exe',
    ]

    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        return {
          available: true,
          mode: 'cli',
          cliPath: candidate,
          baseUrl: '',
          username: '',
          password: '',
        }
      }
    }

    return this.createUnavailableClient()
  }

  private static async detectHttpClient(): Promise<EverythingClientInfo> {
    const interfaceSetting = await DatabaseService.getSetting(Settings.EVERYTHING_INTERFACE)
    const portSetting = await DatabaseService.getSetting(Settings.EVERYTHING_HTTP_PORT)
    const usernameSetting = await DatabaseService.getSetting(Settings.EVERYTHING_USERNAME)
    const passwordSetting = await DatabaseService.getSetting(Settings.EVERYTHING_PASSWORD)

    const host = String(interfaceSetting?.value ?? Settings.EVERYTHING_INTERFACE.default).trim() || '127.0.0.1'
    const port = String(portSetting?.value ?? Settings.EVERYTHING_HTTP_PORT.default).trim() || '80'
    const username = String(usernameSetting?.value ?? '').trim()
    const password = String(passwordSetting?.value ?? '').trim()
    const baseUrl = `http://${host}:${port}`

    const reachable = await this.checkHttpConnectivity(baseUrl, username, password)
    if (!reachable) {
      return this.createUnavailableClient()
    }

    return {
      available: true,
      mode: 'http',
      cliPath: '',
      baseUrl,
      username,
      password,
    }
  }

  private static async searchMarkerPathsByCli(client: EverythingClientInfo, resourceId: string) {
    if (!client.available || !client.cliPath) {
      return []
    }

    const result = spawnSync(client.cliPath, ['-n', '64', resourceId], {
      encoding: 'utf-8',
      windowsHide: true,
    })

    if (result.status !== 0) {
      const stderr = String(result.stderr ?? '').trim()
      throw new Error(stderr || `Everything search failed with exit code ${result.status ?? 'unknown'}`)
    }

    return String(result.stdout ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((candidatePath) => {
        const normalizedPath = path.normalize(candidatePath)
        return isMarkerFileNameMatched(path.basename(normalizedPath), resourceId)
          && path.basename(path.dirname(normalizedPath)).toLowerCase() === '.nrm'
      })
  }

  private static async searchMarkerPathsByHttp(client: EverythingClientInfo, resourceId: string) {
    if (!client.baseUrl) {
      return []
    }

    const payload = await this.requestHttp<{
      results?: Array<{ path?: string; name?: string }>
    }>(client, {
      params: {
        search: resourceId,
        path_column: '1',
        json: '1',
        count: '64',
      }
    })

    return (payload.results ?? [])
      .map((item) => {
        const parentPath = String(item.path ?? '').trim()
        const name = String(item.name ?? '').trim()
        return parentPath && name ? path.join(parentPath, name) : ''
      })
      .filter(Boolean)
      .filter((candidatePath) => {
        const normalizedPath = path.normalize(candidatePath)
        return isMarkerFileNameMatched(path.basename(normalizedPath), resourceId)
          && path.basename(path.dirname(normalizedPath)).toLowerCase() === '.nrm'
      })
  }

  private static async checkHttpConnectivity(baseUrl: string, username: string, password: string) {
    try {
      const client: EverythingClientInfo = {
        available: true,
        mode: 'http',
        cliPath: '',
        baseUrl,
        username,
        password,
      }

      await this.requestHttp(client, {
        timeout: 1500,
        params: {
          search: '',
          json: '1',
          count: '1',
        }
      })

      return true
    } catch {
      return false
    }
  }

  private static detectInstallation(): EverythingInstallInfo {
    const everythingExeCandidates = [
      ...this.findExecutablesByWhere('Everything.exe'),
      'C:\\Program Files\\Everything\\Everything.exe',
      'C:\\Program Files (x86)\\Everything\\Everything.exe',
    ]

    const everythingExePath = everythingExeCandidates.find((candidate) => candidate && fs.existsSync(candidate)) ?? ''
    const installDir = everythingExePath ? path.dirname(everythingExePath) : ''

    return {
      installed: Boolean(everythingExePath),
      installDir,
      everythingExePath,
    }
  }

  private static async isSettingEnabled(setting: typeof Settings.USE_EVERYTHING_HTTP) {
    const settingItem = await DatabaseService.getSetting(setting)
    return String(settingItem?.value ?? setting.default) === '1'
  }

  private static findExecutablesByWhere(executableName: string) {
    const result = spawnSync('where', [executableName], {
      encoding: 'utf-8',
      windowsHide: true,
      shell: false,
    })

    if (result.status !== 0) {
      return []
    }

    return String(result.stdout ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((candidatePath) => fs.existsSync(candidatePath))
  }

  private static createUnavailableClient(): EverythingClientInfo {
    return {
      available: false,
      mode: '',
      cliPath: '',
      baseUrl: '',
      username: '',
      password: '',
    }
  }

  private static async requestHttp<T>(
    client: Pick<EverythingClientInfo, 'baseUrl' | 'username' | 'password'>,
    options: {
      timeout?: number
      params?: Record<string, string>
    }
  ) {
    const requestUrl = new URL('/', client.baseUrl)
    Object.entries(options.params ?? {}).forEach(([key, value]) => {
      requestUrl.searchParams.set(key, value)
    })

    logger.debug('request', {
      url: requestUrl.toString(),
      timeout: options.timeout ?? 0,
      useAuth: Boolean(client.username || client.password),
    })

    const response = await axios.get<T>(requestUrl.toString(), {
      timeout: options.timeout,
      auth: client.username || client.password
        ? {
            username: client.username,
            password: client.password,
          }
        : undefined,
      validateStatus: (status) => status >= 200 && status < 300,
    })

    logger.debug('response', {
      url: requestUrl.toString(),
      status: response.status,
      statusText: response.statusText,
      data: response.data,
      results:
        response.data && typeof response.data === 'object' && 'results' in (response.data as Record<string, unknown>)
          ? (response.data as { results?: unknown }).results
          : undefined,
    })

    return response.data
  }
}
