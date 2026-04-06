import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { pathToFileURL } from 'url'
import { FetchResourceInfoResult } from '../model/models'
import { createLogger } from '../util/logger'
import { FetchInfo } from './fetchInfo'

type PluginLifecycleHook = () => Promise<void> | void
export type ExternalFetchPluginContext = {
  requestJson: <T = unknown>(url: string, options?: { timeoutMs?: number }) => Promise<T>
  logger: {
    debug: (message: string, payload?: unknown) => void
    info: (message: string, payload?: unknown) => void
    warn: (message: string, payload?: unknown) => void
    error: (message: string, payload?: unknown) => void
  }
}
type PluginFetchMethod = (
  resourceId: string,
  context: ExternalFetchPluginContext
) => Promise<Partial<FetchResourceInfoResult> | void> | Partial<FetchResourceInfoResult> | void

export type ExternalFetchPluginDefinition = {
  websiteName: string
  dictTypeName?: string
  websiteValue?: string
  websiteDescription?: string
  websiteExtra?: Record<string, unknown>
  fetchInfo: PluginFetchMethod
  beforeEnable?: PluginLifecycleHook
  afterEnable?: PluginLifecycleHook
  beforeDisable?: PluginLifecycleHook
  afterDisable?: PluginLifecycleHook
}

const EXCLUDED_PLUGIN_FILES = new Set([
  'fetchInfo.ts',
  'fetchInfo.js',
  'plugin.loader.ts',
  'plugin.loader.js'
])

export class PluginLoader {
  private readonly logger = createLogger('plugin-loader')

  constructor(
    private readonly contextProvider: () => Promise<ExternalFetchPluginContext> = async () => ({
      requestJson: async () => {
        throw new Error('插件上下文尚未初始化')
      },
      logger: createPluginLogger(createLogger('plugin:context'))
    })
  ) {}

  async loadAll() {
    const pluginsPath = this.getPluginsPath()
    this.ensurePluginsDirectory(pluginsPath)

    const files = fs.readdirSync(pluginsPath)
    const loadedPlugins: FetchInfo[] = []

    for (const file of files) {
      if (!this.isPluginFile(file)) {
        continue
      }

      try {
        const fullPath = path.join(pluginsPath, file)
        const pluginModule = await import(pathToFileURL(fullPath).href)

        for (const exportedValue of Object.values(pluginModule)) {
          const pluginInstance = this.createPluginInstance(exportedValue)
          if (!pluginInstance) {
            continue
          }

          await pluginInstance.init()
          loadedPlugins.push(pluginInstance)
        }
      } catch (error) {
        this.logger.error('无法加载插件', {
          file,
          pluginsPath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    this.logger.info('插件加载完成', {
      pluginsPath,
      count: loadedPlugins.length
    })
    return loadedPlugins
  }

  private getPluginsPath() {
    if (app.isPackaged) {
      return path.join(path.dirname(app.getPath('exe')), 'plugin')
    }

    return path.join(process.cwd(), 'plugin')
  }

  private ensurePluginsDirectory(pluginsPath: string) {
    if (!fs.existsSync(pluginsPath)) {
      fs.mkdirSync(pluginsPath, { recursive: true })
    }
  }

  private isPluginFile(fileName: string) {
    if (!/\.(cjs|mjs|js)$/i.test(fileName)) {
      return false
    }

    return !EXCLUDED_PLUGIN_FILES.has(fileName)
  }

  private createPluginInstance(exportedValue: unknown) {
    if (this.isFetchInfoClass(exportedValue)) {
      return new exportedValue()
    }

    if (this.isPluginDefinition(exportedValue)) {
      return this.wrapPluginDefinition(exportedValue)
    }

    return null
  }

  private isFetchInfoClass(Target: unknown): Target is new () => FetchInfo {
    return typeof Target === 'function' && Target.prototype instanceof FetchInfo
  }

  private isPluginDefinition(value: unknown): value is ExternalFetchPluginDefinition {
    return Boolean(
      value &&
      typeof value === 'object' &&
      typeof (value as ExternalFetchPluginDefinition).websiteName === 'string' &&
      typeof (value as ExternalFetchPluginDefinition).fetchInfo === 'function'
    )
  }

  private wrapPluginDefinition(pluginDefinition: ExternalFetchPluginDefinition) {
    const normalizedDefinition = pluginDefinition
    const contextProvider = this.contextProvider
    const pluginLogger = createLogger(`plugin:${normalizedDefinition.websiteName}`)

    return new class extends FetchInfo {
      protected readonly websiteName = normalizedDefinition.websiteName
      protected readonly websiteTypeName = normalizedDefinition.dictTypeName
      protected readonly websiteValue = normalizedDefinition.websiteValue
      protected readonly websiteDescription = normalizedDefinition.websiteDescription
      protected readonly websiteExtra = normalizedDefinition.websiteExtra

      protected async fetchInfo(resourceId: string): Promise<FetchResourceInfoResult> {
        const result = new FetchResourceInfoResult()
        const data = await normalizedDefinition.fetchInfo(resourceId, {
          ...(await contextProvider()),
          logger: createPluginLogger(pluginLogger)
        })

        if (!data) {
          return result
        }

        result.name = data.name ?? ''
        result.author = data.author ?? ''
        result.cover = data.cover ?? ''
        result.website = data.website ?? ''
        result.tag = Array.isArray(data.tag) ? Array.from(new Set(data.tag.filter(Boolean))) : []
        result.type = Array.isArray(data.type) ? Array.from(new Set(data.type.filter(Boolean))) : []
        return result
      }

      protected async beforeEnable(): Promise<void> {
        await normalizedDefinition.beforeEnable?.()
      }

      protected async afterEnable(): Promise<void> {
        await normalizedDefinition.afterEnable?.()
      }

      protected async beforeDisable(): Promise<void> {
        await normalizedDefinition.beforeDisable?.()
      }

      protected async afterDisable(): Promise<void> {
        await normalizedDefinition.afterDisable?.()
      }
    }()
  }
}

function createPluginLogger(logger: ReturnType<typeof createLogger>) {
  return {
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
