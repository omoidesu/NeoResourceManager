import {db} from './index'
import {category, settings, dictType, dictData} from './schema'
import {eq} from 'drizzle-orm'
import {generateId} from '../util/id-generator'
import {Settings, DictType} from "../../common/constants";
import path from 'path'
import {app} from 'electron'
import { createLogger } from '../util/logger';

const logger = createLogger('db-seed')

/**
 * 初始化数据库
 */
export const seedDatabase = async () => {
  try {
    // 检查setting表初始化状态
    const initSetting = await db.query.settings.findFirst({
      where: eq(settings.name, Settings.INIT_STATUS.name)
    });

    // 不存在该设置项表示数据库未初始化
    if (initSetting && initSetting.value === '1') {
      logger.info('database has been initialized')
      return
    }

    await initDatabase(!!initSetting);
    logger.info('initialize database successfully')

  } catch (error) {
    logger.error('initialize database failed', error);
  }
}

async function initDatabase(recordExist: boolean) {
  const resolveSettingDefault = (item: typeof Settings[keyof typeof Settings]) => {
    if (item.name === Settings.CACHE_PATH.name) {
      return app.isPackaged ? path.join(app.getPath('userData'), 'cache') : path.join(__dirname, 'cache')
    }

    return item.default
  }

  const createCategoryExtra = (
    extendTable: string,
    resourcePathType: string | null,
    addFirst: string,
    extensions?: string[],
    authorText?: string,
    startText?: string,
    enableFetchInfo: boolean = false
  ) => ({
    extendTable,
    resourcePathType,
    ...(extensions ? { extensions } : {}),
    addFirst,
    authorText,
    startText,
    enableFetchInfo
  })

  db.transaction((tx) => {
    if (!recordExist) {
      const defaultSettings = Object.values(Settings).map(item => (
        {
          id: generateId(),
          name: item.name,
          description: item.description,
          value: resolveSettingDefault(item)
        }
      ));

      tx.insert(settings).values(defaultSettings).run()
    } else {
      tx.update(settings)
        .set({value: '1'})
        .where(eq(settings.name, 'initStatus')).run()
    }

    // 字典类型
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
        name: DictType.STORE_WEBSITE_TYPE,
        description: '贩售网站'
      }
    ]
    tx.insert(dictType).values(dictTypes).run()

    // 字典数据
    const categoryList = [
      {
        id: generateId(),
        name: '游戏',
        description: '游戏',
        value: 'games',
        typeId: dictTypes[0].id,
        extra: createCategoryExtra('game_meta', 'file', '个', ['exe', 'swf', 'html', 'bat'], '开发商/社团', '启动'),
      }, {
        id: generateId(),
        name: '软件',
        description: '软件',
        value: 'software',
        typeId: dictTypes[0].id,
        extra: createCategoryExtra('software_meta', 'file', '个', ['exe', 'bat', 'ps1'], '开发者', '运行')
      }, {
        id: generateId(),
        name: '单图',
        description: '单图',
        value: 'single_image',
        typeId: dictTypes[0].id,
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
        name: '漫画',
        description: '多图',
        value: 'multi_image',
        typeId: dictTypes[0].id,
        extra: createCategoryExtra('multi_image_meta', 'folder', '个', [], '画师', '阅读')
      }, {
        id: generateId(),
        name: '视频',
        description: '视频',
        value: 'video',
        typeId: dictTypes[0].id,
        extra: createCategoryExtra('video_meta', 'file', '个', [
          'mp4',
          'avi',
          'mkv',
          'mov',
          'wmv',
          'flv',
          'webm',
          'm4v'
        ], '发行商/制作者', '播放')
      }, {
        id: generateId(),
        name: '番剧',
        description: '番剧',
        value: 'mulit_video',
        typeId: dictTypes[0].id,
        extra: createCategoryExtra('video_meta', 'folder', '个', [], '发行商/制作者', '播放')
      }, {
        id: generateId(),
        name: '音声',
        description: '音声',
        value: 'asmr',
        typeId: dictTypes[0].id,
        extra: createCategoryExtra('asmr_meta', 'file', '个', [
          'mp3',
          'wav',
          'flac',
          'aac',
          'ogg',
          'm4a',
          'wma',
          'opus'
        ], '制作社团', '播放')
      }, {
        id: generateId(),
        name: '小说',
        description: '小说',
        value: 'novel',
        typeId: dictTypes[0].id,
        extra: createCategoryExtra('novel_meta', 'file', '本', ['txt', 'epub', 'mobi', 'pdf'], '作者', '阅读')
      }, {
        id: generateId(),
        name: '网站',
        description: '网站',
        value: 'website',
        typeId: dictTypes[0].id,
        extra: createCategoryExtra('website_meta', null, '个', [], '', '访问')
      }
    ]
    const languageList = [
      {
        id: generateId(),
        name: '中文',
        description: '中文',
        value: 'zh',
        typeId: dictTypes[1].id
      }, {
        id: generateId(),
        name: '英文',
        description: '英文',
        value: 'en',
        typeId: dictTypes[1].id
      }, {
        id: generateId(),
        name: '日语',
        description: '日语',
        value: 'ja',
        typeId: dictTypes[1].id
      }, {
        id: generateId(),
        name: '其他',
        description: '其他',
        value: 'other',
        typeId: dictTypes[1].id
      }
    ]
    const gameEngineList = [
      // 通用游戏引擎
      {
        id: generateId(),
        name: 'Unity',
        description: 'Unity',
        value: 'unity',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'unity.ico'
        }
      },{
        id: generateId(),
        name: 'Unreal Engine',
        description: '虚幻引擎',
        value: 'unreal',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'unreal.png'
        }
      }, {
        id: generateId(),
        name: 'Cocos',
        description: 'Cocos系列',
        value: 'cocos',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'cocos.ico'
        }
      }, {
        id: generateId(),
        name: 'Godot',
        description: 'Godot',
        value: 'godot',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'godot.png'
        }
      },
      // galgame引擎
      {
        id: generateId(),
        name: 'KIRIKIRI',
        description: '吉里吉里',
        value: 'kirikiri',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'krkr.png'
        }
      }, {
        id: generateId(),
        name: 'NScripter',
        description: 'NScripter',
        value: 'nscripter',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'nscripter.ico'
        }
      }, {
        id: generateId(),
        name: 'Tyrano',
        description: 'TyranoScript/TyranoBuilder',
        value: 'tyrano',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'tyrano.ico'
        }
      }, {
        id: generateId(),
        name: "Ren'py",
        description: "Ren'py",
        value: 'renpy',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'renpy.ico'
        }
      },
      // rpg 引擎
      {
        id: generateId(),
        name: 'RPG Maker 2000/2003',
        description: 'RPG Maker 远古版本',
        value: 'rm2k',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'rm2k.png'
        }
      }, {
        id: generateId(),
        name: 'RPG Maker XP',
        description: '太阳',
        value: 'rmxp',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'rmxp.png'
        }
      }, {
        id: generateId(),
        name: 'RPG Maker VX',
        description: '马头',
        value: 'rmvx',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'rmvx.png'
        }
      }, {
        id: generateId(),
        name: 'RPG Maker VX Ace',
        description: '龙头',
        value: 'rmva',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'rmva.png'
        }
      },
      {
        id: generateId(),
        name: 'RPG Maker MV',
        description: 'RPG Maker MV',
        value: 'rmmv',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'rmmv.png'
        }
      }, {
        id: generateId(),
        name: 'RPG Maker MZ',
        description: 'RPG Maker MZ',
        value: 'rmmz',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'rmmz.png'
        }
      }, {
        id: generateId(),
        name: 'Wolf RPG Editor',
        description: '狼头',
        value: 'wolf',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'wolf.png'
        }
      }, {
        id: generateId(),
        name: 'SRPG Studio',
        description: '战棋游戏',
        value: 'srpg',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'srpg.png'
        }
      },
      {
        id: generateId(),
        name: 'Pixel Game Maker MV',
        description: 'Pixel Game Maker MV',
        value: 'pgmv',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'pixel.png'
        }
      }, {
        id: generateId(),
        name: 'RPG Developer Bakin',
        description: 'RPG Developer Bakin',
        value: 'bakin',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'bakin.png'
        }
      },
      // 其他
      {
        id: generateId(),
        name: 'Flash',
        description: 'Flash',
        value: 'flash',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'flash.png'
        }
      }, {
        id: generateId(),
        name: '网页游戏',
        description: '网页游戏',
        value: 'web',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'html.svg'
        }
      },
      // 编程语言
      {
        id: generateId(),
        name: 'C#',
        description: 'C sharp不是c井',
        value: 'csharp',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'csharp.ico'
        }
      }, {
        id: generateId(),
        name: 'C++',
        description: 'C艹',
        value: 'cplusplus',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'cplusplus.ico'
        }
      }, {
        id: generateId(),
        name: 'Java',
        description: '爪哇',
        value: 'java',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'java.ico'
        }
      }, {
        id: generateId(),
        name: 'Python',
        description: '屁眼通红',
        value: 'python',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'python.ico'
        }
      }, {
        id: generateId(),
        name: 'JavaScript',
        description: '女子小学生！',
        value: 'javascript',
        typeId: dictTypes[2].id,
        extra: {
          icon: 'javascript.png'
        }
      }, {
        id: generateId(),
        name: '其他',
        description: '其他',
        value: 'other',
        typeId: dictTypes[2].id
      }
    ]
    const storeWebsiteList = [
      {
        id: generateId(),
        name: 'DLsite',
        description: '',
        value: 'dlsite',
        typeId: dictTypes[3].id,
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
        typeId: dictTypes[3].id,
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
        typeId: dictTypes[3].id,
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
        typeId: dictTypes[3].id,
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
        typeId: dictTypes[3].id,
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
        typeId: dictTypes[3].id,
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
        typeId: dictTypes[3].id,
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
        typeId: dictTypes[3].id,
        extra: {
          icon: 'freem.ico',
          url: {
            games: 'https://www.freem.ne.jp/win/game/{}'
          }
        }
      }
    ]
    const dictDataList = [...categoryList, ...languageList, ...gameEngineList, ...storeWebsiteList]

    tx.insert(dictData).values(dictDataList).run()

    // 默认分类：游戏 软件 单图 多图 电影 番剧 ASMR 小说 网站
    const categories = [
      {
        id: generateId(),
        name: '游戏',
        emoji: '🎮',
        referenceId: dictDataList[0].id,
        sort: 1
      }, {
        id: generateId(),
        name: '软件',
        emoji: '💻',
        referenceId: dictDataList[1].id,
        sort: 2
      }, {
        id: generateId(),
        name: '单图',
        emoji: '🖼️',
        referenceId: dictDataList[2].id,
        sort: 3
      }, {
        id: generateId(),
        name: '多图',
        emoji: '📚',
        referenceId: dictDataList[3].id,
        sort: 4
      }, {
        id: generateId(),
        name: '电影',
        emoji: '🎬',
        referenceId: dictDataList[4].id,
        sort: 5
      }, {
        id: generateId(),
        name: '番剧',
        emoji: '📺',
        referenceId: dictDataList[5].id,
        sort: 6
      }, {
        id: generateId(),
        name: '音声',
        emoji: '🎧',
        referenceId: dictDataList[6].id,
        sort: 7
      }, {
        id: generateId(),
        name: '小说',
        emoji: '📖',
        referenceId: dictDataList[7].id,
        sort: 8
      }, {
        id: generateId(),
        name: '网站',
        emoji: '🌐',
        referenceId: dictDataList[8].id,
        sort: 9
      }
    ]
    tx.insert(category).values(categories).run()
  })
}
