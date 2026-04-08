export interface SettingDetail {
  readonly name: string;
  readonly description: string;
  readonly default: string;
}

export const Settings = {
  INIT_STATUS: {
    name: 'initStatus',
    description: '数据库初始化状态',
    default: '1'
  },
  THEME_TYPE: {
    name: 'themeType',
    description: '主题类型',
    default: 'dark'
  },
  CACHE_PATH: {
    name: 'cachePath',
    description: '缓存路径',
    default: '__CACHE_PATH__'
  },
  USE_EVERYTHING_HTTP: {
    name: 'useEverythingHttp',
    description: '使用 Everything HTTP服务器，启用方式：工具 -> 选项 -> HTTP 服务器 -> 启用 HTTP 服务器',
    default: '0'
  },
  EVERYTHING_INTERFACE: {
    name: 'everythingInterface',
    description: 'Everything HTTP绑定到接口',
    default: ''
  },
  EVERYTHING_HTTP_PORT: {
    name: 'everythingHttpPort',
    description: 'Everything HTTP服务器端口',
    default: '80'
  },
  EVERYTHING_USERNAME: {
    name: 'everythingUsername',
    description: 'Everything HTTP服务器用户名',
    default: ''
  },
  EVERYTHING_PASSWORD: {
    name: 'everythingPassword',
    description: 'Everything HTTP服务器密码',
    default: ''
  },
  USE_EVERYTHING_CLI: {
    name: 'useEverythingCli',
    description: '使用 Everything 命令行接口, 下载地址：https://www.voidtools.com/zh-cn/downloads/#cli',
    default: '0'
  },
  EVERYTHING_CLI_PATH: {
    name: 'everythingCliPath',
    description: 'Everything 命令行接口路径',
    default: ''
  },
  LOCALE_EMULATOR_PATH: {
    name: 'localeEmulatorPath',
    description: 'LE转区工具路径',
    default: ''
  },
  MTOOL_PATH: {
    name: 'mtoolPath',
    description: 'Mtool路径',
    default: ''
  },
  ENABLE_PROXY: {
    name: 'enableHttpProxy',
    description: '启用代理',
    default: '0'
  },
  PROXY_HOST: {
    name: 'proxyHost',
    description: '代理主机',
    default: ''
  },
  PROXY_PORT: {
    name: 'proxyPort',
    description: '代理端口',
    default: ''
  },
  SHORTCUT_PRINT_SCREEN: {
    name: 'shortcutPrintScreen',
    description: '屏幕截图',
    default: 'f11'
  },
  SHORTCUT_PANIC_KEY: {
    name: 'shortcutPanicKey',
    description: '伪装按钮',
    default: 'escape escape'
  },
  PANIC_MODE: {
    name: 'panicMode',
    description: '伪装类型',
    default: 'updating'
  },
  PANIC_OPEN_URL: {
    name: 'panicOpenUrl',
    description: '伪装按钮打开的网址',
    default: 'https://www.bilibili.com'
  },
  PICTURE_READ_SCROLL_MODE: {
    name: 'pictureReadScrollMode',
    description: '图片阅读模式滚轮功能',
    default: 'zoom'
  },
  THEME_COLOR: {
    name: 'themeColor',
    description: '主题颜色',
    default: ''
  },
  VERSION: {
    name: 'version',
    description: '版本号',
    default: '__VERSION__'
  }
} as const;

export const DictType = {
    RESOURCE_TYPE: 'resourceType',
    LANGUAGE_TYPE: 'languageType',
    GAME_ENGINE_TYPE: 'gameEngineType',
    GAME_SITE_TYPE: 'gameSiteType',
    ASMR_SITE_TYPE: 'asmrSiteType',
    IMAGE_SITE_TYPE: 'imageSiteType',
    MANGA_SITE_TYPE: 'mangaSiteType',
} as const;
export const PanicMode = {
  OPEN_URL: 'openUrl',
  SYSTEM_CRASH: 'crash',
  SYSTEM_UPDATING: 'updating'
} as const;
export const PictureReadScrollMode = {
  ZOOM: 'zoom',
  SCROLL: 'scroll'
} as const;

export const ResourceLaunchMode = {
  NORMAL: 'normal',
  ADMIN: 'admin',
  MTOOL: 'mtool',
  LOCALE_EMULATOR: 'localeEmulator'
} as const;

export const ResourceLogSpecialTime = {
  UNKNOWN_END_TIME: '1970-01-01T00:00:00.000Z'
} as const;

export type SettingKey = typeof Settings[keyof typeof Settings]['name']
export type DictTypeKey = typeof DictType[keyof typeof DictType]
export type ResourceLaunchModeKey = typeof ResourceLaunchMode[keyof typeof ResourceLaunchMode]
