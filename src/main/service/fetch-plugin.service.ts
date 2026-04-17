import { FetchResourceInfoResult } from '../model/models'
import axios from 'axios'
import { Settings } from '../../common/constants'
import { PluginLoader } from '../plugin/plugin.loader'
import type { ExternalFetchPluginContext } from '../plugin/plugin.loader'
import { FetchInfo } from '../plugin/fetchInfo'
import { DatabaseService } from './database.service'
import { createLogger } from '../util/logger'

export class FetchPluginService {
  private static instance: FetchPluginService | null = null
  private readonly logger = createLogger('fetch-plugin-service')
  private readonly pluginLoader = new PluginLoader(() => this.buildPluginContext())
  private plugins: FetchInfo[] = []
  private initialized = false

  static getInstance() {
    if (!this.instance) {
      this.instance = new FetchPluginService()
    }

    return this.instance
  }

  async initialize() {
    if (this.initialized) {
      return
    }

    this.plugins = await this.pluginLoader.loadAll()
    this.logger.info('待启用插件', this.plugins)

    for (const plugin of this.plugins) {
      try {
        const enabled = await plugin.enable()
        this.logger.info('插件启用完成', {
          plugin: plugin.constructor.name,
          enabled
        })
      } catch (error) {
        this.logger.error('插件启用失败', {
          plugin: plugin.constructor.name,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    this.initialized = true
  }

  async fetchResourceInfo(websiteId: string, resourceId: string) {
    // Keep the fetch entry self-contained so CLI tools and future jobs can call it
    // safely without relying on app startup order.
    if (!this.initialized) {
      await this.initialize()
    }

    const plugin = this.plugins.find((item) => item.match(websiteId))
    this.logger.info('plugin found', {plugin})
    if (!plugin) {
      throw new Error('未找到可用的资源信息插件')
    }

    const result = await plugin.fetch(resourceId)
    return result ?? new FetchResourceInfoResult()
  }

  dispose() {
    this.plugins = []
    this.initialized = false
  }

  private async buildPluginContext(): Promise<ExternalFetchPluginContext> {
    const logger = createLogger('fetch-plugin-http')
    return {
      requestJson: async <T = unknown>(url: string, options?: { timeoutMs?: number }) => {
        return this.requestJson<T>(url, options)
      },
      requestText: async (url: string, options?: { timeoutMs?: number; headers?: Record<string, string> }) => {
        return this.requestText(url, options)
      },
      logger: {
        debug(message: string, payload?: unknown) {
          logger.debug(message, payload)
        },
        info(message: string, payload?: unknown) {
          logger.info(message, payload)
        },
        warn(message: string, payload?: unknown) {
          logger.warn(message, payload)
        },
        error(message: string, payload?: unknown) {
          logger.error(message, payload)
        },
      }
    }
  }

  private async requestJson<T = unknown>(url: string, options?: { timeoutMs?: number }) {
    const timeoutMs = options?.timeoutMs ?? 20000
    const proxy = await this.resolveProxyConfig()
    this.logger.info('requestJson start', {
      url,
      timeoutMs,
      proxy: proxy ? `${proxy.protocol}://${proxy.host}:${proxy.port}` : null
    })

    try {
      const response = await axios.get<T>(url, {
        timeout: timeoutMs,
        headers: {
          Accept: 'application/json,text/plain,*/*',
          'User-Agent': 'NeoResourceManager/1.0'
        },
        ...(proxy ? { proxy } : {})
      })

      const payload = response.data as unknown
      this.logger.info('requestJson success', {
        url,
        status: response.status,
        contentType: response.headers['content-type'] ?? '',
        dataType: Array.isArray(payload) ? 'array' : typeof payload,
        dataKeys: payload && typeof payload === 'object' ? Object.keys(payload as Record<string, unknown>).slice(0, 20) : [],
      })

      return response.data
    } catch (error) {
      throw this.normalizeRequestError(error, timeoutMs)
    }
  }

  private async requestText(url: string, options?: { timeoutMs?: number; headers?: Record<string, string> }) {
    const timeoutMs = options?.timeoutMs ?? 20000
    const proxy = await this.resolveProxyConfig()
    this.logger.info('requestText start', {
      url,
      timeoutMs,
      proxy: proxy ? `${proxy.protocol}://${proxy.host}:${proxy.port}` : null
    })

    try {
      const response = await axios.get<ArrayBuffer>(url, {
        timeout: timeoutMs,
        responseType: 'arraybuffer',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
          'User-Agent': 'NeoResourceManager/1.0',
          ...(options?.headers ?? {})
        },
        ...(proxy ? { proxy } : {})
      })
      const data = Buffer.from(response.data).toString('utf8')

      this.logger.info('requestText success', {
        url,
        status: response.status,
        contentType: response.headers['content-type'] ?? '',
        length: data.length
      })

      return data
    } catch (error) {
      throw this.normalizeRequestError(error, timeoutMs)
    }
  }

  private async resolveProxyConfig() {
    const enableProxySetting = await DatabaseService.getSetting(Settings.ENABLE_PROXY)
    const isEnabled = ['1', 'true', 'yes', 'on'].includes(String(enableProxySetting?.value ?? '').trim().toLowerCase())

    if (!isEnabled) {
      return null
    }

    const hostSetting = await DatabaseService.getSetting(Settings.PROXY_HOST)
    const portSetting = await DatabaseService.getSetting(Settings.PROXY_PORT)
    const rawHost = String(hostSetting?.value ?? '').trim()
    const rawPort = String(portSetting?.value ?? '').trim()

    const normalizedProxy = this.normalizeProxyHost(rawHost, rawPort)
    const host = normalizedProxy.host
    const port = normalizedProxy.port

    if (!host || !Number.isFinite(port) || port <= 0) {
      throw new Error('代理已启用，但代理主机或端口配置无效')
    }

    return {
      protocol: normalizedProxy.protocol,
      host,
      port
    }
  }

  // Proxy settings may be stored as either "127.0.0.1" or "http://127.0.0.1".
  // Normalizing both forms here keeps plugin code free of transport details.
  private normalizeProxyHost(rawHost: string, rawPort: string) {
    if (!rawHost) {
      return {
        protocol: 'http' as const,
        host: '',
        port: Number(rawPort)
      }
    }

    if (/^https?:\/\//i.test(rawHost)) {
      const parsedUrl = new URL(rawHost)
      return {
        protocol: parsedUrl.protocol.replace(':', '') as 'http' | 'https',
        host: parsedUrl.hostname,
        port: Number(rawPort || parsedUrl.port)
      }
    }

    return {
      protocol: 'http' as const,
      host: rawHost,
      port: Number(rawPort)
    }
  }

  private normalizeRequestError(error: unknown, timeoutMs: number) {
    if (axios.isAxiosError(error)) {
      const errorCode = String(error.code ?? '')

      if (errorCode === 'ECONNABORTED') {
        return new Error(`请求超时（${timeoutMs}ms）`)
      }

      if (errorCode === 'ENOTFOUND' || errorCode === 'EAI_AGAIN') {
        return new Error('无法解析目标域名，请检查网络连接')
      }

      if (errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT') {
        return new Error('无法连接到目标站点，请检查网络、代理或稍后重试')
      }

      if (error.response?.status) {
        return new Error(`请求失败: HTTP ${error.response.status}`)
      }

      return new Error(error.message || '请求失败')
    }

    return error instanceof Error ? error : new Error(String(error))
  }
}
