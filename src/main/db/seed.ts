import {db} from './index'
import {category, settings, dictType, dictData} from './schema'
import {and, eq} from 'drizzle-orm'
import {generateId} from '../util/id-generator'
import {Settings, DictType} from "../../common/constants";
import path from 'path'
import {app} from 'electron'
import semver from 'semver'
import { createLogger } from '../util/logger';

const logger = createLogger('db-seed')
type SeedTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type SettingItem = typeof Settings[keyof typeof Settings]
type SeedDefinitions = {
  settings: Array<{ item: SettingItem; value: string }>
  dictTypes: Array<typeof dictType.$inferInsert>
  dictDataList: Array<typeof dictData.$inferInsert>
  categories: Array<typeof category.$inferInsert>
}

function resolveCurrentAppVersion() {
  const configuredVersion = String(Settings.VERSION.default ?? '').trim()
  if (configuredVersion && configuredVersion !== '__VERSION__') {
    return configuredVersion
  }

  const appVersion = String(app.getVersion?.() ?? '').trim()
  return appVersion || '0.0.0'
}

function normalizeSemver(input: string) {
  const trimmed = String(input ?? '').trim()
  if (!trimmed) {
    return '0.0.0'
  }

  const withoutPrefix = trimmed.replace(/^[=vV\s]+/, '')
  const directVersion = semver.valid(withoutPrefix)
  if (directVersion) {
    return directVersion
  }

  const numericStartVersion = semver.valid(withoutPrefix.replace(/^[^0-9]*/, ''))
  if (numericStartVersion) {
    return numericStartVersion
  }

  const coercedVersion = semver.coerce(withoutPrefix)?.version
  if (coercedVersion) {
    return coercedVersion
  }

  return '0.0.0'
}

function compareVersion(left: string, right: string) {
  return semver.compare(normalizeSemver(left), normalizeSemver(right))
}

function upsertSetting(
  tx: SeedTransaction,
  item: typeof Settings[keyof typeof Settings],
  value: string
) {
  const existing = tx
    .select()
    .from(settings)
    .where(eq(settings.name, item.name))
    .get()

  if (existing) {
    const nextValue = item.name === Settings.INIT_STATUS.name || item.name === Settings.VERSION.name
      ? value
      : existing.value

    tx.update(settings)
      .set({
        description: item.description,
        value: nextValue,
        locked: item.name === Settings.VERSION.name,
        isDeleted: false
      })
      .where(eq(settings.id, existing.id))
      .run()

    return existing.id
  }

  const id = generateId()
  tx.insert(settings).values({
    id,
    name: item.name,
    description: item.description,
    value,
    locked: item.name === Settings.VERSION.name
  }).run()

  return id
}

function upsertDictType(
  tx: SeedTransaction,
  item: typeof dictType.$inferInsert
) {
  const existing = tx
    .select()
    .from(dictType)
    .where(eq(dictType.name, String(item.name)))
    .get()

  if (existing) {
    tx.update(dictType)
      .set({
        description: item.description,
        isDeleted: false
      })
      .where(eq(dictType.id, existing.id))
      .run()

    return existing.id
  }

  const id = String(item.id ?? generateId())
  tx.insert(dictType).values({
    ...item,
    id
  }).run()
  return id
}

function upsertDictData(
  tx: SeedTransaction,
  item: typeof dictData.$inferInsert
) {
  const existing = tx
    .select()
    .from(dictData)
    .where(and(
      eq(dictData.typeId, String(item.typeId)),
      eq(dictData.value, String(item.value))
    ))
    .get()

  if (existing) {
    tx.update(dictData)
      .set({
        name: item.name,
        description: item.description,
        extra: item.extra,
        isDeleted: false
      })
      .where(eq(dictData.id, existing.id))
      .run()

    return existing.id
  }

  const id = String(item.id ?? generateId())
  tx.insert(dictData).values({
    ...item,
    id
  }).run()
  return id
}

function insertCategoryIfMissing(
  tx: SeedTransaction,
  item: typeof category.$inferInsert
) {
  const existing = tx
    .select()
    .from(category)
    .where(eq(category.name, String(item.name)))
    .get()

  if (existing) {
    tx.update(category)
      .set({
        emoji: item.emoji ?? existing.emoji,
        pillColor: existing.pillColor ?? item.pillColor,
        referenceId: item.referenceId ?? existing.referenceId,
        sort: item.sort ?? existing.sort,
        isDeleted: false
      })
      .where(eq(category.id, existing.id))
      .run()
    return existing.id
  }

  const id = String(item.id ?? generateId())
  tx.insert(category).values({
    ...item,
    id
  }).run()
  return id
}

function resolveSettingDefault(item: SettingItem, currentVersion: string) {
  if (item.name === Settings.CACHE_PATH.name) {
    // Development should keep using the workspace-level cache directory so
    // screenshots/thumbnails stay next to the project instead of being
    // seeded under the compiled main-process output tree.
    return app.isPackaged ? path.join(app.getPath('userData'), 'cache') : path.join(process.cwd(), 'cache')
  }

  if (item.name === Settings.VERSION.name) {
    return currentVersion
  }

  if (item.name === Settings.INIT_STATUS.name) {
    return '1'
  }

  return item.default
}

function createCategoryExtra(
  extendTable: string,
  resourcePathType: string | null,
  addFirst: string,
  extensions?: string[],
  authorText?: string,
  startText?: string,
  enableFetchInfo: boolean = false,
  showCompletedFilter: boolean = false
) {
  return {
    extendTable,
    resourcePathType,
    ...(extensions ? { extensions } : {}),
    addFirst,
    authorText,
    startText,
    ...(showCompletedFilter ? { showCompletedFilter } : {}),
    enableFetchInfo
  }
}

function createEngineExtra(icon: string, mtool: boolean = false) {
  return {
    icon,
    ...(mtool ? { mtool: true } : {})
  }
}

function buildSeedDefinitions(currentVersion: string): SeedDefinitions {
  const settingsList = Object.values(Settings).map((item) => ({
    item,
    value: resolveSettingDefault(item, currentVersion)
  }))

  const dictTypes = [
    {
      id: generateId(),
      name: DictType.RESOURCE_TYPE,
      description: '资源基础类型'
    }, {
      id: generateId(),
      name: DictType.LANGUAGE_TYPE,
      description: '资源语言'
    }, {
      id: generateId(),
      name: DictType.GAME_ENGINE_TYPE,
      description: '游戏引擎'
    }, {
      id: generateId(),
      name: DictType.GAME_SITE_TYPE,
      description: '游戏贩售网站'
    }, {
      id: generateId(),
      name: DictType.IMAGE_SITE_TYPE,
      description: '图片网站'
    }, {
      id: generateId(),
      name: DictType.ASMR_SITE_TYPE,
      description: '音声网站'
    }, {
      id: generateId(),
      name: DictType.MANGA_SITE_TYPE,
      description: '漫画网站'
    }, {
      id: generateId(),
      name: DictType.NOVEL_SITE_TYPE,
      description: '小说网站'
    }
  ]

  const dictTypeIds = {
    resource: dictTypes[0].id,
    language: dictTypes[1].id,
    engine: dictTypes[2].id,
    gameSite: dictTypes[3].id,
    imageSite: dictTypes[4].id,
    asmrSite: dictTypes[5].id,
    mangaSite: dictTypes[6].id,
    novelSite: dictTypes[7].id,
  }

  const categoryList = [
    {
      id: generateId(),
      name: '游戏',
      description: '游戏',
      value: 'games',
      typeId: dictTypeIds.resource,
      extra: createCategoryExtra('game_meta', 'file', '个', ['exe', 'swf', 'html', 'bat'], '开发商/社团', '启动', false, true),
    }, {
      id: generateId(),
      name: '软件',
      description: '软件',
      value: 'software',
      typeId: dictTypeIds.resource,
      extra: createCategoryExtra('software_meta', 'file', '个', ['exe', 'bat', 'ps1', 'lnk'], '开发者', '运行')
    }, {
      id: generateId(),
      name: '单图',
      description: '单图',
      value: 'single_image',
      typeId: dictTypeIds.resource,
      extra: createCategoryExtra('single_image_meta', 'file', '个', [
        'png',
        'jpg',
        'jpeg',
        'webp',
        'gif',
        'bmp',
        'svg'
      ], '画师', '打开')
    }, {
      id: generateId(),
      name: '多图',
      description: '多图',
      value: 'multi_image',
      typeId: dictTypeIds.resource,
      extra: createCategoryExtra('multi_image_meta', 'folder', '个', [], '画师', '阅读')
    }, {
      id: generateId(),
      name: '视频',
      description: '视频',
      value: 'video',
      typeId: dictTypeIds.resource,
      extra: createCategoryExtra('video_meta', 'file', '个', [
        'mp4',
        'avi',
        'mkv',
        'mov',
        'wmv',
        'flv',
        'webm',
        'm4v'
      ], '发行商/制作者', '播放', false, true)
    }, {
      id: generateId(),
      name: '番剧',
      description: '番剧',
      value: 'mulit_video',
      typeId: dictTypeIds.resource,
      extra: createCategoryExtra('video_meta', 'folder', '个', [], '发行商/制作者', '播放')
    }, {
      id: generateId(),
      name: '音声',
      description: '音声',
      value: 'asmr',
      typeId: dictTypeIds.resource,
      extra: createCategoryExtra('asmr_meta', 'folder', '个', [
        'mp3',
        'wav',
        'flac',
        'aac',
        'ogg',
        'm4a',
        'wma'
      ], '制作社团', '播放')
    }, {
      id: generateId(),
      name: '小说',
      description: '小说',
      value: 'novel',
      typeId: dictTypeIds.resource,
      extra: createCategoryExtra('novel_meta', 'file', '本', ['txt', 'epub', 'mobi', 'pdf', 'azw3', 'md'], '作者', '阅读', false, true)
    }, {
      id: generateId(),
      name: '音乐',
      description: '音乐',
      value: 'music',
      typeId: dictTypeIds.resource,
      extra: createCategoryExtra('audio_meta', 'file', '个', ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus', 'ape'], '艺术家', '播放')
    }, {
      id: generateId(),
      name: '网站',
      description: '网站',
      value: 'website',
      typeId: dictTypeIds.resource,
      extra: createCategoryExtra('website_meta', null, '个', [], '', '访问')
    }
  ]

  const languageList = [
    {
      id: generateId(),
      name: '中文',
      description: '中文',
      value: 'zh',
      typeId: dictTypeIds.language
    }, {
      id: generateId(),
      name: '英文',
      description: '英文',
      value: 'en',
      typeId: dictTypeIds.language
    }, {
      id: generateId(),
      name: '日语',
      description: '日语',
      value: 'ja',
      typeId: dictTypeIds.language
    }, {
      id: generateId(),
      name: '其他',
      description: '其他',
      value: 'other',
      typeId: dictTypeIds.language
    }
  ]

  const gameEngineList = [
    {
      id: generateId(),
      name: 'Unity',
      description: 'Unity',
      value: 'unity',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('unity.ico')
    },{
      id: generateId(),
      name: 'Unreal Engine',
      description: '虚幻引擎',
      value: 'unreal',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('unreal.png')
    }, {
      id: generateId(),
      name: 'Cocos',
      description: 'Cocos系列',
      value: 'cocos',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('cocos.ico')
    }, {
      id: generateId(),
      name: 'Godot',
      description: 'Godot',
      value: 'godot',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('godot.png')
    },
    {
      id: generateId(),
      name: 'Kirikiri 2',
      description: '吉里吉里2',
      value: 'kirikiri2',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('krkr.png', true)
    }, {
      id: generateId(),
      name: 'Kirikiri Z',
      description: '吉里吉里Z 32位',
      value: 'kirikiriz',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('krkr.png', true)
    }, {
      id: generateId(),
      name: 'Kirikiri Z 64Bit',
      description: '吉里吉里Z 64位',
      value: 'kirikiriz64',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('krkr.png', true)
    }, {
      id: generateId(),
      name: 'KIRIKIRI',
      description: '吉里吉里（未细分）',
      value: 'kirikiri',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('krkr.png', true)
    }, {
      id: generateId(),
      name: 'NScripter',
      description: 'NScripter',
      value: 'nscripter',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('nscripter.ico')
    }, {
      id: generateId(),
      name: 'Tyrano',
      description: 'TyranoScript/TyranoBuilder',
      value: 'tyrano',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('tyrano.ico', true)
    }, {
      id: generateId(),
      name: "Ren'Py",
      description: "Ren'Py 32位/未区分",
      value: 'renpy',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('renpy.ico', true)
    }, {
      id: generateId(),
      name: "Ren'Py x64",
      description: "Ren'Py 64位",
      value: 'renpy64',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('renpy.ico', true)
    },
    {
      id: generateId(),
      name: 'RPG Maker 2000/2003',
      description: 'RPG Maker 远古版本',
      value: 'rm2k',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('rm2k.png')
    }, {
      id: generateId(),
      name: 'RPG Maker XP',
      description: '太阳',
      value: 'rmxp',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('rmxp.png', true)
    }, {
      id: generateId(),
      name: 'RPG Maker VX',
      description: '马头',
      value: 'rmvx',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('rmvx.png', true)
    }, {
      id: generateId(),
      name: 'RPG Maker VX Ace',
      description: '龙头',
      value: 'rmva',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('rmva.png', true)
    }, {
      id: generateId(),
      name: 'RPG Maker MKXP (Z)',
      description: 'MKXP-Z / mkxp 32位',
      value: 'mkxpz',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('rpgmaker.png', true)
    }, {
      id: generateId(),
      name: 'RPG Maker MKXP (Z) 64Bit',
      description: 'MKXP-Z / mkxp 64位',
      value: 'mkxpz64',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('rpgmaker.png', true)
    }, {
      id: generateId(),
      name: 'RPG Maker MV',
      description: 'RPG Maker MV',
      value: 'rmmv',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('rmmv.png', true)
    }, {
      id: generateId(),
      name: 'RPG Maker MZ',
      description: 'RPG Maker MZ',
      value: 'rmmz',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('rmmz.png', true)
    }, {
      id: generateId(),
      name: 'Wolf RPG Ver 1.00 - 2.24',
      description: 'Wolf RPG Editor 1.00 - 2.24',
      value: 'wolf224',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('wolf.png', true)
    }, {
      id: generateId(),
      name: 'Wolf RPG Ver 2.25 - 2.99',
      description: 'Wolf RPG Editor 2.25 - 2.99',
      value: 'wolf225',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('wolf.png', true)
    }, {
      id: generateId(),
      name: 'Wolf RPG Ver 3.00 - 3.322',
      description: 'Wolf RPG Editor 3.00 - 3.322',
      value: 'wolf300',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('wolf.png', true)
    }, {
      id: generateId(),
      name: 'Wolf RPG Ver 3.323 - 3.396',
      description: 'Wolf RPG Editor 3.323 - 3.396',
      value: 'wolf3322',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('wolf.png', true)
    }, {
      id: generateId(),
      name: 'Wolf RPG Ver 3.500 - 3.611',
      description: 'Wolf RPG Editor 3.500 - 3.611',
      value: 'wolf350',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('wolf.png', true)
    }, {
      id: generateId(),
      name: 'Wolf RPG Ver 3.612 - 3.684',
      description: 'Wolf RPG Editor 3.612 - 3.684',
      value: 'wolf3612',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('wolf.png', true)
    }, {
      id: generateId(),
      name: 'Wolf RPG Editor',
      description: '狼头（未细分）',
      value: 'wolf',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('wolf.png', true)
    }, {
      id: generateId(),
      name: 'SRPG Studio',
      description: '战棋游戏',
      value: 'srpg',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('srpg.png', true)
    }, {
      id: generateId(),
      name: 'SMILE GAME BUILDER x86',
      description: 'SMILE GAME BUILDER 原生版',
      value: 'smilegamebuilder',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('smilegamebuilder.png', true)
    }, {
      id: generateId(),
      name: 'SMILE GAME BUILDER +Unity x86',
      description: 'SMILE GAME BUILDER + Unity 32位',
      value: 'smilegamebuilder_unity',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('smilegamebuilder.png', true)
    }, {
      id: generateId(),
      name: 'SMILE GAME BUILDER +Unity x64',
      description: 'SMILE GAME BUILDER + Unity 64位',
      value: 'smilegamebuilder_unity64',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('smilegamebuilder.png', true)
    }, {
      id: generateId(),
      name: 'Pixel Game Maker MV',
      description: 'Pixel Game Maker MV',
      value: 'pgmv',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('pixel.png', true)
    }, {
      id: generateId(),
      name: 'RPG Developer Bakin',
      description: 'RPG Developer Bakin',
      value: 'bakin',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('bakin.png', true)
    },
    {
      id: generateId(),
      name: 'Flash',
      description: 'Flash',
      value: 'flash',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('flash.png')
    }, {
      id: generateId(),
      name: '网页游戏',
      description: '网页游戏',
      value: 'web',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('html.svg')
    },
    {
      id: generateId(),
      name: 'C#',
      description: 'C sharp不是c井',
      value: 'csharp',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('csharp.ico')
    }, {
      id: generateId(),
      name: 'C++',
      description: 'C艹',
      value: 'cplusplus',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('cplusplus.ico')
    }, {
      id: generateId(),
      name: 'Java',
      description: '爪哇',
      value: 'java',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('java.ico')
    }, {
      id: generateId(),
      name: 'Python',
      description: '屁眼通红',
      value: 'python',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('python.ico')
    }, {
      id: generateId(),
      name: 'JavaScript',
      description: '女子小学生！',
      value: 'javascript',
      typeId: dictTypeIds.engine,
      extra: createEngineExtra('javascript.png')
    }, {
      id: generateId(),
      name: '其他',
      description: '其他',
      value: 'other',
      typeId: dictTypeIds.engine
    }
  ]

  const gameSiteList = [
    {
      id: generateId(),
      name: 'DLsite',
      description: '',
      value: 'dlsite',
      typeId: dictTypeIds.gameSite,
      extra: {
        rule: {
          startsWith: {
            maniax: 'RJ',
            boots: 'BJ',
            pro: 'VJ'
          }
        },
        icon: 'dlsite.ico',
        url: {
          games: 'https://www.dlsite.com/{rule}/work/=/product_id/{}.html'
        }
      }
    }, {
      id: generateId(),
      name: 'FANZA',
      description: '',
      value: 'fanza',
      typeId: dictTypeIds.gameSite,
      extra: {
        icon: 'fanza.ico',
        url: {
          games: 'https://www.dmm.co.jp/dc/doujin/-/detail/=/cid={}',
          video: 'https://video.dmm.co.jp/av/content/?id={}'
        }
      }
    }, {
      id: generateId(),
      name: 'Steam',
      description: '',
      value: 'steam',
      typeId: dictTypeIds.gameSite,
      extra: {
        icon: 'steam.ico',
        url: {
          games: 'https://store.steampowered.com/app/{}'
        }
      }
    }, {
      id: generateId(),
      name: 'bokiboki',
      description: '',
      value: 'bokiboki',
      typeId: dictTypeIds.gameSite,
      extra: {
        icon: 'bokiboki.png',
        url: {
          games: 'https://boki2.fun/r18/proitem?obj_id={}'
        }
      }
    }, {
      id: generateId(),
      name: '072 Project',
      description: '',
      value: '072project',
      typeId: dictTypeIds.gameSite,
      extra: {
        icon: '072project.ico',
        url: {
          games: 'https://072project.com/r18/cn/shop/{}'
        }
      }
    }, {
      id: generateId(),
      name: 'Getchu',
      description: '',
      value: 'getchu',
      typeId: dictTypeIds.gameSite,
      extra: {
        icon: 'getchu.ico',
        url: {
          games: 'https://www.getchu.com/item/{}'
        }
      }
    }, {
      id: generateId(),
      name: 'Booth',
      description: '',
      value: 'booth',
      typeId: dictTypeIds.gameSite,
      extra: {
        icon: 'booth.ico',
        url: {
          games: 'https://booth.pm/ja/items/{}'
        }
      }
    }, {
      id: generateId(),
      name: 'Freem',
      description: '',
      value: 'freem',
      typeId: dictTypeIds.gameSite,
      extra: {
        icon: 'freem.ico',
        url: {
          games: 'https://www.freem.ne.jp/win/game/{}'
        }
      }
    }
  ]

  const imageSiteList = [
    {
      id: generateId(),
      name: 'Pixiv',
      description: '',
      value: 'pixiv',
      typeId: dictTypeIds.imageSite,
      extra: {
        url: {
          image: 'https://www.pixiv.net/artworks/{}'
        }
      }
    }
  ]

  const asmrSiteList = [
    {
      id: generateId(),
      name: 'DLsite',
      description: '',
      value: 'dlsite',
      typeId: dictTypeIds.asmrSite,
      extra: {
        enableFetchInfo: true,
        rule: {
          startsWith: {
            maniax: 'RJ',
            boots: 'BJ',
            pro: 'VJ'
          }
        },
        icon: 'dlsite.ico',
        url: {
          games: 'https://www.dlsite.com/{rule}/work/=/product_id/{}.html'
        }
      }
    }
  ]

  const mangaSiteList = [
    {
      id: generateId(),
      name: 'ComicMeta',
      description: '综合搜索漫画信息',
      value: 'comic-meta',
      typeId: dictTypeIds.mangaSite,
      extra: {
        enableFetchInfo: true
      }
    }, {
      id: generateId(),
      name: 'E-Hentai',
      description: 'ComicMeta 子来源：E-Hentai',
      value: 'e-hentai',
      typeId: dictTypeIds.mangaSite,
      extra: {
        enableFetchInfo: false,
        url: {
          manga: 'https://e-hentai.org/?f_search={}'
        }
      }
    }, {
      id: generateId(),
      name: 'nhentai',
      description: 'ComicMeta 子来源：nhentai',
      value: 'nhentai',
      typeId: dictTypeIds.mangaSite,
      extra: {
        enableFetchInfo: false,
        url: {
          manga: 'https://nhentai.net/search/?q={}'
        }
      }
    }
  ]

  const novelSiteList = [
    {
      id: generateId(),
      name: '国家图书馆',
      description: '中国国家图书馆 ISBN 图书信息',
      value: 'nlc-isbn',
      typeId: dictTypeIds.novelSite,
      extra: {
        enableFetchInfo: true,
        url: {
          novel: 'http://opac.nlc.cn/F?func=find-b&find_code=ISB&request={}&local_base=NLC01'
        }
      }
    }
  ]

  const dictDataList = [
    ...categoryList,
    ...languageList,
    ...gameEngineList,
    ...gameSiteList,
    ...imageSiteList,
    ...asmrSiteList,
    ...mangaSiteList,
    ...novelSiteList,
  ]

  const categoryDefinitions = [
    { name: '游戏', emoji: '🎮', value: 'games', sort: 1, pillColor: '#9333ea' },
    { name: '软件', emoji: '💻', value: 'software', sort: 2, pillColor: '#0891b2' },
    { name: '图片', emoji: '🖼️', value: 'single_image', sort: 3, pillColor: '#d97706' },
    { name: '漫画', emoji: '📚', value: 'multi_image', sort: 4, pillColor: '#ea580c' },
    { name: '电影', emoji: '🎬', value: 'video', sort: 5, pillColor: '#e11d48' },
    { name: '番剧', emoji: '📺', value: 'mulit_video', sort: 6, pillColor: '#db2777' },
    { name: '音声', emoji: '🎧', value: 'asmr', sort: 7, pillColor: '#65a30d' },
    { name: '音乐', emoji: '🎶', value: 'music', sort: 8, pillColor: '#0284c7' },
    { name: '小说', emoji: '📖', value: 'novel', sort: 9, pillColor: '#16a34a' },
    { name: '网站', emoji: '🌐', value: 'website', sort: 10, pillColor: '#737373' }
  ]

  const categories = categoryDefinitions.map((item) => ({
    id: generateId(),
    name: item.name,
    emoji: item.emoji,
    pillColor: item.pillColor,
    referenceId: dictDataList.find((dictItem) => dictItem.typeId === dictTypeIds.resource && dictItem.value === item.value)?.id,
    sort: item.sort
  }))

  return {
    settings: settingsList,
    dictTypes,
    dictDataList,
    categories
  }
}

function syncSeedData(tx: SeedTransaction, definitions: SeedDefinitions, options: { includeCategories: boolean }) {
  definitions.settings.forEach(({ item, value }) => {
    upsertSetting(tx, item, value)
  })

  const dictTypeIdMap = new Map<string, string>()
  definitions.dictTypes.forEach((item) => {
    const id = upsertDictType(tx, item)
    dictTypeIdMap.set(String(item.name), id)
    dictTypeIdMap.set(String(item.id), id)
  })

  const dictDataIdMap = new Map<string, string>()
  const dictDataSourceIdMap = new Map<string, string>()
  definitions.dictDataList.forEach((item) => {
    const resolvedTypeId = dictTypeIdMap.get(String(item.typeId)) ?? String(item.typeId)
    const id = upsertDictData(tx, {
      ...item,
      typeId: resolvedTypeId
    })
    dictDataIdMap.set(`${resolvedTypeId}:${item.value}`, id)
    dictDataSourceIdMap.set(String(item.id), id)
  })

  if (!options.includeCategories) {
    return
  }

  definitions.categories.forEach((item) => {
    const referenceId = item.referenceId
      ? dictDataSourceIdMap.get(String(item.referenceId))
      : undefined

    insertCategoryIfMissing(tx, {
      ...item,
      referenceId: referenceId ?? item.referenceId
    })
  })
}

function ensureBaseSeed(tx: SeedTransaction, currentVersion: string, options: { includeCategories: boolean }) {
  const definitions = buildSeedDefinitions(currentVersion)
  syncSeedData(tx, definitions, options)
}

function reconcileCategorySeedData(tx: SeedTransaction, currentVersion: string) {
  const definitions = buildSeedDefinitions(currentVersion)
  syncSeedData(tx, definitions, { includeCategories: true })
}

function applyVersionSeedPatches(
  tx: SeedTransaction,
  options: {
    fromVersion: string
    toVersion: string
    includeCategories: boolean
  }
) {
  if (compareVersion(options.fromVersion, options.toVersion) >= 0) {
    return
  }

  ensureBaseSeed(tx, options.toVersion, {
    includeCategories: options.includeCategories
  })
}

/**
 * 初始化数据库
 */
export const seedDatabase = async () => {
  try {
    const currentVersion = resolveCurrentAppVersion()

    // 检查setting表初始化状态
    const initSetting = await db.query.settings.findFirst({
      where: eq(settings.name, Settings.INIT_STATUS.name)
    });
    const versionSetting = await db.query.settings.findFirst({
      where: eq(settings.name, Settings.VERSION.name)
    });

    const storedVersion = String(versionSetting?.value ?? '').trim() || '0.0.0'
    const initialized = initSetting?.value === '1'
    const needsUpgrade = !versionSetting || compareVersion(currentVersion, storedVersion) > 0

    // 不存在该设置项表示数据库未初始化
    if (initialized && !needsUpgrade) {
      db.transaction((tx) => {
        reconcileCategorySeedData(tx, currentVersion)
      })
      logger.info('database seed is up to date', {
        currentVersion,
        databaseVersion: storedVersion
      })
      return
    }

    await initDatabase({
      includeCategories: !initialized,
      fromVersion: storedVersion,
      currentVersion
    });
    logger.info('initialize database successfully', {
      currentVersion,
      databaseVersion: storedVersion,
      mode: initialized ? 'upgrade' : 'initialize'
    })

  } catch (error) {
    logger.error('initialize database failed', error);
  }
}

async function initDatabase(options: {
  includeCategories: boolean
  fromVersion: string
  currentVersion: string
}) {
  const { includeCategories, fromVersion, currentVersion } = options

  db.transaction((tx) => {
    applyVersionSeedPatches(tx, {
      fromVersion,
      toVersion: currentVersion,
      includeCategories
    })
  })
}
