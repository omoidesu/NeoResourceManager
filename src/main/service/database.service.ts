import {db} from '../db'
import {
  category,
  dictData,
  resource,
  resourceLog,
  resourceStat,
  settings,
  tag,
  tagResource,
  typeResource,
  resourceType, dictType, author, authorWork, storeWork,
  actor, gameMeta, softwareMeta, singleImageMeta, multiImageMeta, videoMeta, mediaSub, asmrMeta, audioMeta, novelMeta, websiteMeta, homePin,
} from '../db/schema'
import {and, asc, count, desc, eq, inArray, not, or, sql} from 'drizzle-orm'
import {generateId} from '../util/id-generator'
import { ResourceLogSpecialTime, SettingDetail, Settings } from "../../common/constants";
import { createLogger } from '../util/logger'

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type DbExecutor = typeof db | DbTransaction

type ResourceQueryParams = {
  keyword?: string
  authorIds?: string[]
  actorNames?: string[]
  albumNames?: string[]
  tagIds?: string[]
  typeIds?: string[]
  engineIds?: string[]
  missingOnly?: boolean
  favoriteOnly?: boolean
  completedOnly?: boolean
  runningOnly?: boolean
  page?: number
  pageSize?: number
  sortBy?: string
}

const MIN_LONG_UNVISITED_DAYS = 30
const MAX_LONG_UNVISITED_DAYS = 365

const DEFAULT_CATEGORY_PILL_COLORS: Record<string, string> = {
  游戏: '#9333ea',
  软件: '#0891b2',
  图片: '#d97706',
  漫画: '#ea580c',
  电影: '#e11d48',
  番剧: '#db2777',
  音声: '#65a30d',
  音乐: '#0284c7',
  小说: '#16a34a',
  网站: '#737373'
}

export class DatabaseService {
  private static categoryPillColorColumnReady = false
  private static resourceTopAndHomePinSchemaReady = false
  private static resourceSearchTextColumnReady = false
  private static logger = createLogger('database-service')

  private static logCategoryQueryDuration(label: string, categoryId: string, startedAt: number, extra?: Record<string, any>) {
    this.logger.info('category query timing', {
      label,
      categoryId,
      elapsedMs: Date.now() - startedAt,
      ...(extra ?? {})
    })
  }

  private static async ensureCategoryPillColorColumn() {
    if (this.categoryPillColorColumnReady) {
      return
    }

    const rows = await db.all(sql`PRAGMA table_info('category')`) as Array<{ name?: string }>
    if (!rows.some((row) => row.name === 'pill_color')) {
      await db.run(sql`ALTER TABLE category ADD pill_color text`)
    }

    for (const [name, pillColor] of Object.entries(DEFAULT_CATEGORY_PILL_COLORS)) {
      await db
        .update(category)
        .set({ pillColor })
        .where(and(
          eq(category.name, name),
          sql`${category.pillColor} is null`
        ))
    }

    this.categoryPillColorColumnReady = true
  }

  private static async ensureResourceTopAndHomePinSchema() {
    if (this.resourceTopAndHomePinSchemaReady) {
      return
    }

    const resourceColumns = await db.all(sql`PRAGMA table_info('resource')`) as Array<{ name?: string }>
    if (!resourceColumns.some((row) => row.name === 'if_top')) {
      await db.run(sql`ALTER TABLE resource ADD if_top integer DEFAULT 0`)
    }

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS home_pin (
        resource_id text PRIMARY KEY NOT NULL,
        pinned_at integer DEFAULT (strftime('%s', 'now')),
        is_deleted integer DEFAULT 0,
        FOREIGN KEY (resource_id) REFERENCES resource(id)
      )
    `)

    this.resourceTopAndHomePinSchemaReady = true
  }

  private static buildResourceSearchTextExpr() {
    return sql<string>`trim(
      coalesce(${resource.title}, '') || ' ' ||
      coalesce(${resource.description}, '') || ' ' ||
      coalesce((
        select ${category.name}
        from ${category}
        where ${category.id} = ${resource.categoryId}
      ), '') || ' ' ||
      coalesce((
        select group_concat(${tag.name}, ' ')
        from ${tagResource}
        inner join ${tag} on ${tag.id} = ${tagResource.tagId}
        where ${tagResource.resourceId} = ${resource.id}
          and coalesce(${tag.isDeleted}, 0) = 0
      ), '') || ' ' ||
      coalesce((
        select group_concat(${resourceType.name}, ' ')
        from ${typeResource}
        inner join ${resourceType} on ${resourceType.id} = ${typeResource.typeId}
        where ${typeResource.resourceId} = ${resource.id}
          and coalesce(${resourceType.isDeleted}, 0) = 0
      ), '') || ' ' ||
      coalesce((
        select group_concat(${author.name}, ' ')
        from ${authorWork}
        inner join ${author} on ${author.id} = ${authorWork.authorId}
        where ${authorWork.resourceId} = ${resource.id}
          and coalesce(${authorWork.isDeleted}, 0) = 0
          and coalesce(${author.isDeleted}, 0) = 0
      ), '') || ' ' ||
      coalesce((
        select group_concat(${actor.name}, ' ')
        from ${actor}
        where ${actor.resourceId} = ${resource.id}
          and coalesce(${actor.isDeleted}, 0) = 0
      ), '') || ' ' ||
      coalesce((
        select group_concat(${storeWork.workId}, ' ')
        from ${storeWork}
        where ${storeWork.resourceId} = ${resource.id}
          and coalesce(${storeWork.isDeleted}, 0) = 0
      ), '') || ' ' ||
      coalesce((select ${gameMeta.nameZh} from ${gameMeta} where ${gameMeta.resourceId} = ${resource.id}), '') || ' ' ||
      coalesce((select ${gameMeta.nameJp} from ${gameMeta} where ${gameMeta.resourceId} = ${resource.id}), '') || ' ' ||
      coalesce((select ${gameMeta.nameEn} from ${gameMeta} where ${gameMeta.resourceId} = ${resource.id}), '') || ' ' ||
      coalesce((select ${gameMeta.nickname} from ${gameMeta} where ${gameMeta.resourceId} = ${resource.id}), '') || ' ' ||
      coalesce((select ${audioMeta.artist} from ${audioMeta} where ${audioMeta.resourceId} = ${resource.id}), '') || ' ' ||
      coalesce((select ${audioMeta.album} from ${audioMeta} where ${audioMeta.resourceId} = ${resource.id}), '') || ' ' ||
      coalesce((select ${asmrMeta.cv} from ${asmrMeta} where ${asmrMeta.resourceId} = ${resource.id}), '') || ' ' ||
      coalesce((select ${asmrMeta.scenario} from ${asmrMeta} where ${asmrMeta.resourceId} = ${resource.id}), '') || ' ' ||
      coalesce((select ${asmrMeta.illust} from ${asmrMeta} where ${asmrMeta.resourceId} = ${resource.id}), '') || ' ' ||
      coalesce((select ${websiteMeta.url} from ${websiteMeta} where ${websiteMeta.resourceId} = ${resource.id}), '')
    )`
  }

  private static async ensureResourceSearchTextColumn() {
    if (this.resourceSearchTextColumnReady) {
      return
    }

    const rows = await db.all(sql`PRAGMA table_info('resource')`) as Array<{ name?: string }>
    if (!rows.some((row) => row.name === 'search_text')) {
      await db.run(sql`ALTER TABLE resource ADD search_text text`)
    }

    const searchTextExpr = this.buildResourceSearchTextExpr()
    const searchTextColumn = sql.raw(`"search_text"`)
    await db.run(sql`
      UPDATE ${resource}
      SET ${searchTextColumn} = ${searchTextExpr}
      WHERE coalesce(${resource.isDeleted}, 0) = 0
        AND (
          ${resource.searchText} IS NULL
          OR trim(${resource.searchText}) = ''
        )
    `)

    this.resourceSearchTextColumnReady = true
  }

  static async refreshResourceSearchText(resourceId: string, tx?: DbExecutor) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return
    }

    await this.ensureResourceSearchTextColumn()
    const executor = tx ?? db
    const searchTextExpr = this.buildResourceSearchTextExpr()
    const searchTextColumn = sql.raw(`"search_text"`)
    await executor.run(sql`
      UPDATE ${resource}
      SET ${searchTextColumn} = ${searchTextExpr}
      WHERE ${resource.id} = ${normalizedResourceId}
    `)
  }

  private static isMissingCategoryPillColorError(error: unknown) {
    const message = String((error as { message?: unknown })?.message ?? error ?? '')
    return message.includes('no such column: category.pill_color')
  }

  private static buildResourceFilterConditions(
    categoryId: string,
    query: ResourceQueryParams = {}
  ) {
    const keyword = String(query.keyword ?? '').trim()
    const authorIds = (query.authorIds ?? []).filter(Boolean)
    const actorNames = (query.actorNames ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)
    const albumNames = (query.albumNames ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)
    const tagIds = (query.tagIds ?? []).filter(Boolean)
    const typeIds = (query.typeIds ?? []).filter(Boolean)
    const engineIds = (query.engineIds ?? []).filter(Boolean)

    const conditions = [
      eq(resource.categoryId, categoryId),
      eq(resource.isDeleted, false)
    ]

    if (keyword) {
      conditions.push(sql`lower(${resource.title}) like ${`%${keyword.toLowerCase()}%`}`)
    }

    if (query.missingOnly) {
      conditions.push(eq(resource.missingStatus, true))
    }

    if (query.favoriteOnly) {
      conditions.push(eq(resource.ifFavorite, true))
    }

    if (query.completedOnly) {
      conditions.push(eq(resource.isCompleted, true))
    }

    if (query.runningOnly) {
      conditions.push(sql`exists (
        select 1
        from ${resourceLog}
        where ${resourceLog.resourceId} = ${resource.id}
          and coalesce(${resourceLog.isDeleted}, 0) = 0
          and ${resourceLog.endTime} is null
      )`)
    }

    if (authorIds.length) {
      conditions.push(sql`exists (
        select 1
        from ${authorWork}
        where ${authorWork.resourceId} = ${resource.id}
          and ${inArray(authorWork.authorId, authorIds)}
          and coalesce(${authorWork.isDeleted}, 0) = 0
      )`)
    }

    if (actorNames.length) {
      conditions.push(sql`exists (
        select 1
        from ${actor}
        where ${actor.resourceId} = ${resource.id}
          and ${inArray(actor.name, actorNames)}
          and coalesce(${actor.isDeleted}, 0) = 0
      )`)
    }

    if (albumNames.length) {
      conditions.push(sql`exists (
        select 1
        from ${audioMeta}
        where ${audioMeta.resourceId} = ${resource.id}
          and ${inArray(audioMeta.album, albumNames)}
      )`)
    }

    if (tagIds.length) {
      conditions.push(sql`exists (
        select 1
        from ${tagResource}
        where ${tagResource.resourceId} = ${resource.id}
          and ${inArray(tagResource.tagId, tagIds)}
      )`)
    }

    if (typeIds.length) {
      conditions.push(sql`exists (
        select 1
        from ${typeResource}
        where ${typeResource.resourceId} = ${resource.id}
          and ${inArray(typeResource.typeId, typeIds)}
      )`)
    }

    if (engineIds.length) {
      conditions.push(sql`exists (
        select 1
        from ${gameMeta}
        where ${gameMeta.resourceId} = ${resource.id}
          and ${inArray(gameMeta.engine, engineIds)}
      )`)
    }

    return conditions
  }

  static async getCategory() {
    await this.ensureCategoryPillColorColumn()

    const queryCategory = () => db
        .select({
          id: category.id,
          name: category.name,
          emoji: category.emoji,
          pillColor: category.pillColor,
          sort: category.sort,
          extra: dictData.extra,
        })
        .from(category)
        .leftJoin(dictData, eq(category.referenceId, dictData.id))
        .where(eq(category.isDeleted, false))
        .orderBy(asc(category.sort))

    try {
      return await queryCategory()
    } catch (error) {
      if (!this.isMissingCategoryPillColorError(error)) {
        throw error
      }

      await this.ensureCategoryPillColorColumn()
      return await queryCategory()
    }
  }

  static async getCategoryById(id: string) {
    await this.ensureCategoryPillColorColumn()

    return await db.query.category.findFirst({
      where: and(
        eq(category.id, id),
        eq(category.isDeleted, false)
      ),
      with: {
        meta: true
      }
    })
  }

  static async getCategoryByName(name: string) {
    await this.ensureCategoryPillColorColumn()

    return await db.query.category.findFirst({
      where: and(
        eq(category.name, name),
        eq(category.isDeleted, false)
      )
    })
  }

  static async getSetting(setting: SettingDetail, tx?: DbExecutor) {
    const executor = tx ?? db

    return await executor.query.settings.findFirst({
      where: and(
        eq(settings.name, setting.name),
        eq(settings.isDeleted, false)
      )
    })
  }

  static async setSetting(setting: SettingDetail, value: string, tx?: DbExecutor) {
    const executor = tx ?? db
    const settingItem = await this.getSetting(setting, executor)

    if (settingItem) {
      await executor.update(settings)
        .set({value})
        .where(eq(settings.id, settingItem.id))
      return
    }

    await executor.insert(settings).values({
      id: generateId(),
      name: setting.name,
      description: setting.description,
      value
    })
  }

  static async setSettingLocked(setting: SettingDetail, locked: boolean, tx?: DbExecutor) {
    const executor = tx ?? db
    const settingItem = await this.getSetting(setting, executor)

    if (settingItem) {
      await executor.update(settings)
        .set({ locked })
        .where(eq(settings.id, settingItem.id))
      return
    }

    await executor.insert(settings).values({
      id: generateId(),
      name: setting.name,
      description: setting.description,
      value: setting.default,
      locked,
    })
  }

  static async getAllSetting() {
    return await db.query.settings.findMany({
      where: eq(settings.isDeleted, false)
    })
  }

  static async getResourceByCategoryId(categoryId: string, query: ResourceQueryParams = {}) {
    await this.ensureResourceTopAndHomePinSchema()

    const startedAt = Date.now()
    const page = Math.max(1, Number(query.page ?? 1))
    const pageSize = Math.max(1, Number(query.pageSize ?? 24))
    const whereClause = and(...this.buildResourceFilterConditions(categoryId, query))
    const categoryInfo = await this.getCategoryById(categoryId)
    const extendTableName = String(categoryInfo?.meta?.extra?.extendTable ?? '').trim()
    const isNovelCategory = extendTableName === 'novel_meta'
    const isVideoCategory = extendTableName === 'video_meta'
    const isAudioCategory = extendTableName === 'audio_meta'
    const isAsmrCategory = extendTableName === 'asmr_meta'
    const isWebsiteCategory = extendTableName === 'website_meta'

    const totalResult = await db
      .select({ total: count(resource.id) })
      .from(resource)
      .where(whereClause)

    const total = Number(totalResult[0]?.total ?? 0)

    const orderByClause = (() => {
      switch (query.sortBy) {
        case 'title-asc':
          return [desc(resource.ifTop), asc(resource.title), desc(resource.createTime)]
        case 'title-desc':
          return [desc(resource.ifTop), desc(resource.title), desc(resource.createTime)]
        case 'createTime-asc':
          return [desc(resource.ifTop), asc(resource.createTime), asc(resource.title)]
        case 'lastAccessTime-desc':
          return [desc(resource.ifTop), desc(resourceStat.lastAccessTime), desc(resource.createTime), asc(resource.title)]
        case 'lastAccessTime-asc':
          return [desc(resource.ifTop), asc(resourceStat.lastAccessTime), asc(resource.createTime), asc(resource.title)]
        case 'totalRuntime-desc':
          return [desc(resource.ifTop), desc(resourceStat.totalRuntime), desc(resource.createTime), asc(resource.title)]
        case 'totalRuntime-asc':
          return [desc(resource.ifTop), asc(resourceStat.totalRuntime), asc(resource.createTime), asc(resource.title)]
        case 'firstAccessTime-desc':
          return [desc(resource.ifTop), desc(resourceStat.firstAccessTime), desc(resource.createTime), asc(resource.title)]
        case 'firstAccessTime-asc':
          return [desc(resource.ifTop), asc(resourceStat.firstAccessTime), asc(resource.createTime), asc(resource.title)]
        case 'createTime-desc':
        default:
          return [desc(resource.ifTop), desc(resource.createTime), asc(resource.title)]
      }
    })()

    const pagedIds = await db
      .select({ id: resource.id })
      .from(resource)
      .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
      .where(whereClause)
      .orderBy(...orderByClause)
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    const resourceIds = pagedIds.map((item) => item.id)
    if (!resourceIds.length) {
      this.logCategoryQueryDuration('getResourceByCategoryId', categoryId, startedAt, {
        total,
        page,
        pageSize,
        itemCount: 0,
        sortBy: String(query.sortBy ?? 'createTime-desc'),
        keyword: String(query.keyword ?? '').trim()
      })
      return {
        items: [],
        total,
        page,
        pageSize
      }
    }

    const resourceList = await db.query.resource.findMany({
      where: inArray(resource.id, resourceIds),
      columns: {
        id: true,
        title: true,
        categoryId: true,
        coverPath: true,
        basePath: true,
        fileName: true,
        ifFavorite: true,
        ifTop: true,
        isCompleted: true,
        rating: true,
        missingStatus: true,
        createTime: true,
      },
      with: {
        ...(isVideoCategory ? {
          videoMeta: {
            columns: {
              year: true,
              lastPlayFile: true,
              lastPlayTime: true,
            }
          },
          mediaSubs: {
            columns: {
              fileName: true,
              relativePath: true,
              kind: true,
              sortOrder: true,
            }
          }
        } : {}),
        ...(isAudioCategory ? {
          audioMeta: {
            columns: {
              album: true,
              lastPlayTime: true,
            }
          }
        } : {}),
        ...(isAsmrCategory ? {
          asmrMeta: {
            columns: {
              lastPlayFile: true,
              lastPlayTime: true,
            }
          }
        } : {}),
        ...(isNovelCategory ? {
          novelMeta: {
            columns: {
              publisher: true,
              year: true,
            }
          }
        } : {}),
        ...(isWebsiteCategory ? {
          websiteMeta: {
            columns: {
              url: true,
              favicon: true,
              isDownloadLink: true,
            }
          }
        } : {}),
        actors: {
          columns: {
            id: true,
            name: true,
          }
        },
        tags: {
          columns: {
            resourceId: false,
            tagId: false,
          },
          with: {
            tag: {
              columns: {
                id: true,
                name: true,
              }
            }
          }
        },
        types: {
          columns: {
            resourceId: false,
            typeId: false,
          },
          with: {
            type: {
              columns: {
                id: true,
                name: true,
              }
            }
          }
        },
        authors: {
          columns: {
            authorId: false,
            resourceId: false,
            categoryId: false,
            isDeleted: false,
          },
          with: {
            author: {
              columns: {
                id: true,
                name: true,
              }
            }
          }
        }
      }
    })
    const [runningResourceIds, homePinRows] = await Promise.all([
      this.getRunningResourceIdsByResourceIds(resourceIds),
      db
        .select({
          resourceId: homePin.resourceId,
          pinnedAt: homePin.pinnedAt
        })
        .from(homePin)
        .where(and(
          inArray(homePin.resourceId, resourceIds),
          eq(homePin.isDeleted, false)
        ))
    ])
    const runningResourceIdSet = new Set(runningResourceIds)
    const homePinMap = new Map(homePinRows.map((item) => [String(item.resourceId ?? '').trim(), item.pinnedAt ?? null]))

    const resourceMap = new Map(resourceList.map((item) => [
      item.id,
      {
        ...item,
        homePinnedAt: homePinMap.get(String(item.id ?? '').trim()) ?? null,
        isRunning: runningResourceIdSet.has(String(item.id ?? '').trim()),
        actors: item.actors,
        videoSubs: Array.isArray((item as any).mediaSubs)
          ? (item as any).mediaSubs.filter((subItem: any) => String(subItem?.kind ?? '') === 'video')
          : undefined,
        tags: item.tags.map(tagItem => tagItem.tag),
        types: item.types.map(typeItem => typeItem.type),
        authors: item.authors.map(authorItem => authorItem.author)
      }
    ]))

    const result = {
      items: resourceIds.map((id) => resourceMap.get(id)).filter(Boolean),
      total,
      page,
      pageSize
    }
    this.logCategoryQueryDuration('getResourceByCategoryId', categoryId, startedAt, {
      total,
      page,
      pageSize,
      itemCount: result.items.length,
      sortBy: String(query.sortBy ?? 'createTime-desc'),
      keyword: String(query.keyword ?? '').trim()
    })
    return result
  }

  static async getRecentlyAddedResources(days = 7, limit = 10) {
    const normalizedDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 7)))
    const normalizedLimit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 10)))

    return db
      .select({
        id: resource.id,
        title: resource.title,
        categoryId: resource.categoryId,
        coverPath: resource.coverPath,
        createTime: resource.createTime,
        categoryName: category.name,
        categoryEmoji: category.emoji
      })
      .from(resource)
      .leftJoin(category, eq(resource.categoryId, category.id))
      .where(and(
        eq(resource.isDeleted, false),
        sql`${resource.createTime} >= strftime('%s', 'now', ${`-${normalizedDays} days`})`
      ))
      .orderBy(desc(resource.createTime), asc(resource.title))
      .limit(normalizedLimit)
  }

  static async getHomeNextPlayResources(limit = 9) {
    await this.ensureCategoryPillColorColumn()

    const normalizedLimit = Math.max(1, Math.min(12, Math.floor(Number(limit) || 9)))
    const resolveNextPlayKind = (categoryNameInput: unknown) => {
      const categoryName = String(categoryNameInput ?? '').trim().toLowerCase()

      if (['小说', '书', 'novel', 'book', '漫画', 'comic', 'manga'].some((keyword) => categoryName.includes(keyword))) {
        return 'read' as const
      }

      if (['音乐', 'music', '音声', 'asmr', '广播剧', 'audio'].some((keyword) => categoryName.includes(keyword))) {
        return 'listen' as const
      }

      if (['电影', 'movie', '番剧', 'anime', '视频', 'video'].some((keyword) => categoryName.includes(keyword))) {
        return 'watch' as const
      }

      if (['网站', 'web', 'website', '网址'].some((keyword) => categoryName.includes(keyword))) {
        return 'visit' as const
      }

      if (['游戏', 'game', 'galgame'].some((keyword) => categoryName.includes(keyword))) {
        return 'play' as const
      }

      return 'use' as const
    }
    const buildNextPlayReason = (categoryNameInput: unknown, source: 'recent-unopened' | 'favorite-dormant' | 'high-rating' | 'active-category' | 'random-fill') => {
      const kind = resolveNextPlayKind(categoryNameInput)

      switch (source) {
        case 'recent-unopened':
          if (kind === 'read') return '最近添加，还没真正开始读'
          if (kind === 'listen') return '最近添加，还没认真听过'
          if (kind === 'watch') return '最近添加，还没认真看过'
          if (kind === 'visit') return '最近添加，还没真正访问过'
          if (kind === 'play') return '最近添加，还没真正打开玩过'
          return '最近添加，还没真正用过'
        case 'favorite-dormant':
          if (kind === 'read') return '收藏很久了，可以找个时间读一会'
          if (kind === 'listen') return '收藏很久了，可以重新听听'
          if (kind === 'watch') return '收藏很久了，可以重新看看'
          if (kind === 'visit') return '收藏很久了，值得再去看看'
          if (kind === 'play') return '收藏很久了，可以回来继续玩'
          return '收藏很久了，也许现在正好用得上'
        case 'high-rating':
          if (kind === 'read') return '评分很高，值得优先读读看'
          if (kind === 'listen') return '评分很高，值得优先听听看'
          if (kind === 'watch') return '评分很高，值得优先看看'
          if (kind === 'visit') return '评分很高，值得优先点开看看'
          if (kind === 'play') return '评分很高，值得优先开玩'
          return '评分很高，值得优先体验'
        case 'active-category':
          if (kind === 'read') return '你最近常看这类内容，可以接着读'
          if (kind === 'listen') return '你最近常听这类内容，可以接着听'
          if (kind === 'watch') return '你最近常看这类内容，可以接着看'
          if (kind === 'visit') return '你最近常用这类站点，也许正好用得上'
          if (kind === 'play') return '你最近常玩这类内容，可以接着玩'
          return '你最近常用这类资源，可以接着用'
        case 'random-fill':
        default:
          if (kind === 'read') return '随机翻到这本，也许正好想读'
          if (kind === 'listen') return '随机翻到这条，也许刚好想听'
          if (kind === 'watch') return '随机翻到这部，也许刚好想看'
          if (kind === 'visit') return '随机翻到这个，也许刚好用得上'
          if (kind === 'play') return '随机翻到这个，也许刚好想玩'
          return '随机补位，也许正好用得上'
      }
    }
    const recentLogRows = await db
      .select({ resourceId: resourceLog.resourceId })
      .from(resourceLog)
      .innerJoin(resource, eq(resourceLog.resourceId, resource.id))
      .where(and(
        eq(resourceLog.isDeleted, false),
        eq(resource.isDeleted, false),
        sql`${resourceLog.startTime} is not null`
      ))
      .groupBy(resourceLog.resourceId)
      .orderBy(desc(sql`max(${resourceLog.startTime})`))
      .limit(12)

    const excludedIds = recentLogRows.map((item) => String(item.resourceId ?? '')).filter(Boolean)
    const baseConditions = [
      eq(resource.isDeleted, false),
      eq(category.isDeleted, false),
      excludedIds.length ? not(inArray(resource.id, excludedIds)) : undefined
    ].filter(Boolean) as any[]

    const selectFields = {
      id: resource.id,
      title: resource.title,
      categoryId: resource.categoryId,
      categoryName: category.name,
      categoryEmoji: category.emoji,
      categoryPillColor: category.pillColor,
      coverPath: resource.coverPath,
      basePath: resource.basePath,
      fileName: resource.fileName,
      ifFavorite: resource.ifFavorite,
      rating: resource.rating,
      createTime: resource.createTime,
      accessCount: sql<number>`coalesce(${resourceStat.accessCount}, 0)`
    }

    const [recentUnopenedRows, favoriteDormantRows, highRatingRows, activeCategoryRows, randomRows] = await Promise.all([
      db
        .select(selectFields)
        .from(resource)
        .innerJoin(category, eq(resource.categoryId, category.id))
        .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
        .where(and(
          ...baseConditions,
          sql`coalesce(${resourceStat.accessCount}, 0) = 0`,
          sql`${resource.createTime} >= strftime('%s', 'now', '-60 days')`
        ))
        .orderBy(sql`random()`)
        .limit(12),
      db
        .select(selectFields)
        .from(resource)
        .innerJoin(category, eq(resource.categoryId, category.id))
        .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
        .where(and(
          ...baseConditions,
          eq(resource.ifFavorite, true),
          or(
            sql`${resourceStat.lastAccessTime} is null and ${resource.createTime} < strftime('%s', 'now', '-90 days')`,
            sql`${resourceStat.lastAccessTime} < strftime('%s', 'now', '-90 days')`
          )
        ))
        .orderBy(sql`random()`)
        .limit(12),
      db
        .select(selectFields)
        .from(resource)
        .innerJoin(category, eq(resource.categoryId, category.id))
        .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
        .where(and(
          ...baseConditions,
          sql`coalesce(${resource.rating}, -1) >= 8`
        ))
        .orderBy(desc(resource.rating), desc(resource.createTime), asc(resource.title))
        .limit(12),
      db
        .select(selectFields)
        .from(resource)
        .innerJoin(category, eq(resource.categoryId, category.id))
        .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
        .where(and(
          ...baseConditions,
          inArray(resource.categoryId, db
            .select({ categoryId: resource.categoryId })
            .from(resourceLog)
            .innerJoin(resource, eq(resourceLog.resourceId, resource.id))
            .where(and(
              eq(resourceLog.isDeleted, false),
              eq(resource.isDeleted, false),
              sql`${resourceLog.startTime} >= strftime('%s', 'now', '-30 days')`
            ))
            .groupBy(resource.categoryId)
            .orderBy(desc(count(resourceLog.resourceId)))
            .limit(3))
        ))
        .orderBy(sql`random()`)
        .limit(12),
      db
        .select(selectFields)
        .from(resource)
        .innerJoin(category, eq(resource.categoryId, category.id))
        .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
        .where(and(...baseConditions))
        .orderBy(sql`random()`)
        .limit(18)
    ])

    const selected = new Map<string, any>()
    const addLimitedPool = (
      rows: any[],
      limitForPool: number,
      source: 'recent-unopened' | 'favorite-dormant' | 'high-rating' | 'active-category' | 'random-fill'
    ) => {
      let added = 0
      for (const row of rows) {
        const id = String(row?.id ?? '')
        if (!id || selected.has(id)) {
          continue
        }
        selected.set(id, {
          ...row,
          reason: buildNextPlayReason(row?.categoryName, source)
        })
        added += 1
        if (selected.size >= normalizedLimit || added >= limitForPool) {
          break
        }
      }
    }

    addLimitedPool(recentUnopenedRows, 2, 'recent-unopened')
    addLimitedPool(favoriteDormantRows, 2, 'favorite-dormant')
    addLimitedPool(highRatingRows, 2, 'high-rating')
    addLimitedPool(activeCategoryRows, 2, 'active-category')
    addLimitedPool(randomRows, normalizedLimit, 'random-fill')

    return [...selected.values()]
      .slice(0, normalizedLimit)
      .map((item, index) => ({
        ...item,
        order: index + 1,
        categoryName: String(item?.categoryName ?? '').trim(),
        categoryEmoji: String(item?.categoryEmoji ?? '').trim() || null
      }))
  }

  static async getHomeFavoriteOverview() {
    const favoriteBase = and(
      eq(resource.isDeleted, false),
      eq(resource.ifFavorite, true)
    )

    const [frequentResult, recentResult, dormantResult] = await Promise.all([
      db
        .select({ total: count(resource.id) })
        .from(resource)
        .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
        .where(and(
          favoriteBase,
          sql`coalesce(${resourceStat.accessCount}, 0) >= 3`,
          sql`${resourceStat.lastAccessTime} >= strftime('%s', 'now', '-30 days')`
        )),
      db
        .select({ total: count(resource.id) })
        .from(resource)
        .where(and(
          favoriteBase,
          sql`${resource.createTime} >= strftime('%s', 'now', '-14 days')`
        )),
      db
        .select({ total: count(resource.id) })
        .from(resource)
        .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
        .where(and(
          favoriteBase,
          or(
            sql`${resourceStat.lastAccessTime} is null and ${resource.createTime} < strftime('%s', 'now', '-90 days')`,
            sql`${resourceStat.lastAccessTime} < strftime('%s', 'now', '-90 days')`
          )
        ))
    ])

    return [
      {
        key: 'frequent',
        title: '常用收藏',
        value: Number(frequentResult[0]?.total ?? 0),
        meta: '近 30 天打开 3 次以上'
      },
      {
        key: 'recent',
        title: '最近收藏',
        value: Number(recentResult[0]?.total ?? 0),
        meta: '近 14 天新增资源'
      },
      {
        key: 'dormant',
        title: '沉睡收藏',
        value: Number(dormantResult[0]?.total ?? 0),
        meta: '超过 90 天未打开'
      }
    ]
  }

  static async getHomePinnedResources(limit = 12) {
    await this.ensureResourceTopAndHomePinSchema()
    await this.ensureCategoryPillColorColumn()

    const normalizedLimit = Math.max(1, Math.min(24, Math.floor(Number(limit) || 12)))

    return await db
      .select({
        id: resource.id,
        title: resource.title,
        categoryId: resource.categoryId,
        categoryName: category.name,
        categoryEmoji: category.emoji,
        categoryPillColor: category.pillColor,
        coverPath: resource.coverPath,
        basePath: resource.basePath,
        fileName: resource.fileName,
        pinnedAt: homePin.pinnedAt,
        createTime: resource.createTime,
        accessCount: sql<number>`coalesce(${resourceStat.accessCount}, 0)`,
        lastAccessTime: resourceStat.lastAccessTime
      })
      .from(homePin)
      .innerJoin(resource, eq(homePin.resourceId, resource.id))
      .innerJoin(category, eq(resource.categoryId, category.id))
      .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
      .where(and(
        eq(homePin.isDeleted, false),
        eq(resource.isDeleted, false),
        eq(category.isDeleted, false)
      ))
      .orderBy(desc(homePin.pinnedAt), desc(resource.createTime), asc(resource.title))
      .limit(normalizedLimit)
  }

  static async getHomeCoverWallData(query: number | { filter?: string; limit?: number; offset?: number; keyword?: string } = 15) {
    await this.ensureCategoryPillColorColumn()
    await this.ensureResourceSearchTextColumn()

    const filter = typeof query === 'object'
      ? String(query?.filter ?? 'all')
      : 'all'
    const normalizedLimit = Math.max(1, Math.min(180, Math.floor(typeof query === 'object' ? Number(query?.limit) : Number(query)) || 60))
    const normalizedOffset = Math.max(0, Math.floor(typeof query === 'object' ? Number(query?.offset) : 0) || 0)
    const keyword = typeof query === 'object' ? String(query?.keyword ?? '').trim().toLowerCase() : ''
    const keywordTerms = keyword.split(/\s+/).filter(Boolean)

    const selectFields = {
      id: resource.id,
      title: resource.title,
      categoryId: resource.categoryId,
      categoryName: category.name,
      categoryEmoji: category.emoji,
      categoryPillColor: category.pillColor,
      coverPath: resource.coverPath,
      ifFavorite: resource.ifFavorite,
      isCompleted: resource.isCompleted,
      missingStatus: resource.missingStatus,
      rating: resource.rating,
      createTime: resource.createTime,
      lastAccessTime: resourceStat.lastAccessTime,
      accessCount: resourceStat.accessCount,
      isPinned: sql<number>`exists(
        select 1
        from ${homePin}
        where ${homePin.resourceId} = ${resource.id}
          and coalesce(${homePin.isDeleted}, 0) = 0
      )`,
      tagCount: sql<number>`(
        select count(*)
        from ${tagResource}
        where ${tagResource.resourceId} = ${resource.id}
      )`,
      authorCount: sql<number>`(
        select count(*)
        from ${authorWork}
        where ${authorWork.resourceId} = ${resource.id}
          and coalesce(${authorWork.isDeleted}, 0) = 0
      )`,
      searchText: resource.searchText
    }
    const sharedWhere = and(
      eq(resource.isDeleted, false),
      eq(category.isDeleted, false)
    )
    const recentRunWhere = and(
      sharedWhere,
      eq(resourceLog.isDeleted, false),
      sql`${resourceLog.startTime} >= strftime('%s', 'now', '-30 days')`
    )
    const recentAddWhere = and(
      sharedWhere,
      sql`${resource.createTime} >= strftime('%s', 'now', '-30 days')`
    )
    const favoriteWhere = and(sharedWhere, eq(resource.ifFavorite, true))
    const coverOnlyWhere = and(
      sharedWhere,
      sql`${resource.coverPath} is not null`,
      sql`trim(${resource.coverPath}) <> ''`
    )
    const keywordWhere = keywordTerms.length
      ? and(...keywordTerms.map((term) => sql`lower(coalesce(${resource.searchText}, '')) like ${`%${term}%`}`))
      : undefined
    const mergeWhere = (...conditions: Array<any>) => {
      const filtered = conditions.filter(Boolean)
      return filtered.length ? and(...filtered) : undefined
    }

    const [allCount, recentRunCount, recentAddCount, favoriteCount, coverOnlyCount] = await Promise.all([
      db.select({ total: count(resource.id) })
        .from(resource)
        .innerJoin(category, eq(resource.categoryId, category.id))
        .where(mergeWhere(sharedWhere, keywordWhere)),
      db.select({ total: count(sql`distinct ${resource.id}`) })
        .from(resourceLog)
        .innerJoin(resource, eq(resourceLog.resourceId, resource.id))
        .innerJoin(category, eq(resource.categoryId, category.id))
        .where(mergeWhere(recentRunWhere, keywordWhere)),
      db.select({ total: count(resource.id) })
        .from(resource)
        .innerJoin(category, eq(resource.categoryId, category.id))
        .where(mergeWhere(recentAddWhere, keywordWhere)),
      db.select({ total: count(resource.id) })
        .from(resource)
        .innerJoin(category, eq(resource.categoryId, category.id))
        .where(mergeWhere(favoriteWhere, keywordWhere)),
      db.select({ total: count(resource.id) })
        .from(resource)
        .innerJoin(category, eq(resource.categoryId, category.id))
        .where(mergeWhere(coverOnlyWhere, keywordWhere))
    ])

    const counts = {
      all: Number(allCount[0]?.total ?? 0),
      recentRun: Number(recentRunCount[0]?.total ?? 0),
      recentAdd: Number(recentAddCount[0]?.total ?? 0),
      favorite: Number(favoriteCount[0]?.total ?? 0),
      coverOnly: Number(coverOnlyCount[0]?.total ?? 0)
    }

    let items: any[] = []
    if (filter === 'recentRun') {
      items = await db.select({
        ...selectFields,
        latestStartTime: sql<number>`max(${resourceLog.startTime})`
      })
        .from(resourceLog)
        .innerJoin(resource, eq(resourceLog.resourceId, resource.id))
        .innerJoin(category, eq(resource.categoryId, category.id))
        .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
        .where(mergeWhere(recentRunWhere, keywordWhere))
        .groupBy(resource.id, category.id, resourceStat.lastAccessTime)
        .orderBy(desc(sql`max(${resourceLog.startTime})`), asc(resource.title))
        .limit(normalizedLimit)
        .offset(normalizedOffset)
    } else {
      if (filter === 'recentAdd') {
        items = await db.select(selectFields)
          .from(resource)
          .innerJoin(category, eq(resource.categoryId, category.id))
          .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
          .where(mergeWhere(recentAddWhere, keywordWhere))
          .orderBy(desc(resource.createTime), asc(resource.title))
          .limit(normalizedLimit)
          .offset(normalizedOffset)
      } else if (filter === 'favorite') {
        items = await db.select(selectFields)
          .from(resource)
          .innerJoin(category, eq(resource.categoryId, category.id))
          .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
          .where(mergeWhere(favoriteWhere, keywordWhere))
          .orderBy(asc(resource.title), desc(resource.createTime))
          .limit(normalizedLimit)
          .offset(normalizedOffset)
      } else if (filter === 'coverOnly') {
        items = await db.select(selectFields)
          .from(resource)
          .innerJoin(category, eq(resource.categoryId, category.id))
          .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
          .where(mergeWhere(coverOnlyWhere, keywordWhere))
          .orderBy(asc(resource.title), desc(resource.createTime))
          .limit(normalizedLimit)
          .offset(normalizedOffset)
      } else {
        items = await db.select(selectFields)
          .from(resource)
          .innerJoin(category, eq(resource.categoryId, category.id))
          .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
          .where(mergeWhere(sharedWhere, keywordWhere))
          .orderBy(asc(resource.title), desc(resource.createTime))
          .limit(normalizedLimit)
          .offset(normalizedOffset)
      }
    }

    const totalForFilter = filter === 'recentRun'
      ? counts.recentRun
      : filter === 'recentAdd'
        ? counts.recentAdd
        : filter === 'favorite'
          ? counts.favorite
          : filter === 'coverOnly'
            ? counts.coverOnly
            : counts.all

    return {
      counts,
      items,
      total: totalForFilter,
      hasMore: normalizedOffset + items.length < totalForFilter
    }
  }

  static async getRandomResource() {
    const rows = await db
      .select({
        id: resource.id,
        title: resource.title,
        categoryId: resource.categoryId,
        createTime: resource.createTime,
        categoryName: category.name,
        categoryEmoji: category.emoji
      })
      .from(resource)
      .innerJoin(category, eq(resource.categoryId, category.id))
      .where(and(
        eq(resource.isDeleted, false),
        eq(category.isDeleted, false)
      ))
      .orderBy(sql`random()`)
      .limit(1)

    return rows[0] ?? null
  }

  static async getFavoriteResources(page = 1, pageSize = 10) {
    const normalizedPage = Math.max(1, Math.floor(Number(page) || 1))
    const normalizedPageSize = Math.max(1, Math.min(50, Math.floor(Number(pageSize) || 10)))
    const whereClause = and(
      eq(resource.isDeleted, false),
      eq(resource.ifFavorite, true),
      eq(category.isDeleted, false)
    )

    const totalResult = await db
      .select({ total: count(resource.id) })
      .from(resource)
      .innerJoin(category, eq(resource.categoryId, category.id))
      .where(whereClause)

    const items = await db
      .select({
        id: resource.id,
        title: resource.title,
        categoryId: resource.categoryId,
        categoryName: category.name,
        categoryEmoji: category.emoji,
        categoryPillColor: category.pillColor,
        coverPath: resource.coverPath,
        createTime: resource.createTime,
        basePath: resource.basePath,
        fileName: resource.fileName
      })
      .from(resource)
      .innerJoin(category, eq(resource.categoryId, category.id))
      .where(whereClause)
      .orderBy(desc(resource.createTime), asc(resource.title))
      .limit(normalizedPageSize)
      .offset((normalizedPage - 1) * normalizedPageSize)

    return {
      items,
      total: Number(totalResult[0]?.total ?? 0),
      page: normalizedPage,
      pageSize: normalizedPageSize
    }
  }

  static async getDashboardStats() {
    const longUnvisitedSetting = await this.getSetting(Settings.DASHBOARD_LONG_UNVISITED_DAYS)
    const configuredLongUnvisitedDays = Math.max(
      MIN_LONG_UNVISITED_DAYS,
      Math.min(
        MAX_LONG_UNVISITED_DAYS,
        Math.floor(Number(longUnvisitedSetting?.value ?? Settings.DASHBOARD_LONG_UNVISITED_DAYS.default) || MIN_LONG_UNVISITED_DAYS)
      )
    )

    const [
      totalResult,
      favoriteResult,
      completedResult,
      missingResult,
      missingCoverResult,
      longUnvisitedResult,
      recentActivityResult
    ] = await Promise.all([
      db
        .select({ total: count(resource.id) })
        .from(resource)
        .where(eq(resource.isDeleted, false)),
      db
        .select({ total: count(resource.id) })
        .from(resource)
        .where(and(
          eq(resource.isDeleted, false),
          eq(resource.ifFavorite, true)
        )),
      db
        .select({ total: count(resource.id) })
        .from(resource)
        .where(and(
          eq(resource.isDeleted, false),
          eq(resource.isCompleted, true)
        )),
      db
        .select({ total: count(resource.id) })
        .from(resource)
        .where(and(
          eq(resource.isDeleted, false),
          eq(resource.missingStatus, true)
        )),
      db
        .select({ total: count(resource.id) })
        .from(resource)
        .where(and(
          eq(resource.isDeleted, false),
          sql`(${resource.coverPath} is null or trim(${resource.coverPath}) = '')`
        )),
      db
        .select({ total: count(resource.id) })
        .from(resource)
        .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
        .where(and(
          eq(resource.isDeleted, false),
          sql`(
            (${resourceStat.lastAccessTime} is not null and ${resourceStat.lastAccessTime} < strftime('%s', 'now', ${`-${configuredLongUnvisitedDays} days`}))
            or
            (${resourceStat.lastAccessTime} is null and ${resource.createTime} < strftime('%s', 'now', ${`-${configuredLongUnvisitedDays} days`}))
          )`
        )),
      db
        .select({
          launchCount: count(resourceLog.resourceId),
          totalRuntime: sql<number>`coalesce(sum(coalesce(${resourceLog.duration}, 0)), 0)`
        })
        .from(resourceLog)
        .innerJoin(resource, eq(resourceLog.resourceId, resource.id))
        .where(and(
          eq(resourceLog.isDeleted, false),
          eq(resource.isDeleted, false),
          sql`${resourceLog.startTime} >= strftime('%s', 'now', '-30 days')`
        ))
    ])

    return {
      totalResources: Number(totalResult[0]?.total ?? 0),
      favoriteResources: Number(favoriteResult[0]?.total ?? 0),
      completedResources: Number(completedResult[0]?.total ?? 0),
      missingResources: Number(missingResult[0]?.total ?? 0),
      missingCovers: Number(missingCoverResult[0]?.total ?? 0),
      longUnvisitedResources: Number(longUnvisitedResult[0]?.total ?? 0),
      recentLaunchCount: Number(recentActivityResult[0]?.launchCount ?? 0),
      recentRuntimeSeconds: Number(recentActivityResult[0]?.totalRuntime ?? 0)
    }
  }

  static async getActivityHeatmap(days = 365) {
    const normalizedDays = Math.max(1, Math.min(730, Math.floor(Number(days) || 365)))
    const startTimeCondition = sql`${resourceLog.startTime} >= strftime('%s', 'now', ${`-${normalizedDays} days`})`
    const baseWhereClause = and(
      eq(resourceLog.isDeleted, false),
      eq(resource.isDeleted, false),
      startTimeCondition
    )
    const hourExpression = sql<number>`cast(strftime('%H', ${resourceLog.startTime}, 'unixepoch', 'localtime') as integer)`
    const weekdayExpression = sql<number>`cast(strftime('%w', ${resourceLog.startTime}, 'unixepoch', 'localtime') as integer)`

    const [daysResult, hourResult, weekdayResult, categoryResult] = await Promise.all([
      db
      .select({
        date: sql<string>`strftime('%Y-%m-%d', ${resourceLog.startTime}, 'unixepoch', 'localtime')`,
        launchCount: count(resourceLog.resourceId),
        totalRuntime: sql<number>`coalesce(sum(coalesce(${resourceLog.duration}, 0)), 0)`
      })
      .from(resourceLog)
      .innerJoin(resource, eq(resourceLog.resourceId, resource.id))
      .where(baseWhereClause)
      .groupBy(sql`strftime('%Y-%m-%d', ${resourceLog.startTime}, 'unixepoch', 'localtime')`)
      .orderBy(sql`strftime('%Y-%m-%d', ${resourceLog.startTime}, 'unixepoch', 'localtime')`),
      db
      .select({
        hour: hourExpression,
        launchCount: count(resourceLog.resourceId)
      })
      .from(resourceLog)
      .innerJoin(resource, eq(resourceLog.resourceId, resource.id))
      .where(baseWhereClause)
      .groupBy(hourExpression)
      .orderBy(desc(sql`count(${resourceLog.resourceId})`), asc(hourExpression))
      .limit(1),
      db
      .select({
        weekday: weekdayExpression,
        launchCount: count(resourceLog.resourceId)
      })
      .from(resourceLog)
      .innerJoin(resource, eq(resourceLog.resourceId, resource.id))
      .where(baseWhereClause)
      .groupBy(weekdayExpression)
      .orderBy(desc(sql`count(${resourceLog.resourceId})`), asc(weekdayExpression))
      .limit(1),
      db
      .select({
        categoryName: category.name,
        categoryEmoji: category.emoji,
        launchCount: count(resourceLog.resourceId)
      })
      .from(resourceLog)
      .innerJoin(resource, eq(resourceLog.resourceId, resource.id))
      .innerJoin(category, eq(resource.categoryId, category.id))
      .where(and(
        baseWhereClause,
        eq(category.isDeleted, false)
      ))
      .groupBy(category.id, category.name, category.emoji)
      .orderBy(desc(sql`count(${resourceLog.resourceId})`), asc(category.name))
      .limit(1)
    ])

    const peakHour = Number(hourResult[0]?.hour)
    const peakWeekday = Number(weekdayResult[0]?.weekday)
    const peakCategory = categoryResult[0]
    const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const formatHourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00 - ${String(hour).padStart(2, '0')}:59`

    return {
      days: daysResult,
      summary: {
        mostActiveHour: Number.isFinite(peakHour) ? formatHourLabel(peakHour) : '暂无',
        mostActiveWeekday: weekdayLabels[peakWeekday] ?? '暂无',
        mostUsedCategory: peakCategory?.categoryName
          ? `${peakCategory.categoryEmoji ? `${peakCategory.categoryEmoji} ` : ''}${peakCategory.categoryName}`
          : '暂无'
      }
    }
  }

  static async getDashboardUsageDistribution(days = 30) {
    const normalizedDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 30)))
    const startTimeCondition = sql`${resourceLog.startTime} >= strftime('%s', 'now', ${`-${normalizedDays} days`})`
    const whereClause = and(
      eq(resourceLog.isDeleted, false),
      eq(resource.isDeleted, false),
      eq(category.isDeleted, false),
      startTimeCondition
    )

    const rows = await db
      .select({
        categoryName: category.name,
        categoryEmoji: category.emoji,
        categoryPillColor: category.pillColor,
        launchCount: count(resourceLog.resourceId)
      })
      .from(resourceLog)
      .innerJoin(resource, eq(resourceLog.resourceId, resource.id))
      .innerJoin(category, eq(resource.categoryId, category.id))
      .where(whereClause)
      .groupBy(category.id, category.name, category.emoji, category.pillColor)
      .orderBy(desc(sql`count(${resourceLog.resourceId})`), asc(category.name))
      .limit(5)

    return rows.map((item) => ({
      categoryName: String(item.categoryName ?? '').trim() || '未分类',
      categoryEmoji: String(item.categoryEmoji ?? '').trim() || '',
      categoryPillColor: String(item.categoryPillColor ?? '').trim() || null,
      launchCount: Number(item.launchCount ?? 0)
    }))
  }

  static async getDashboardLongUnvisitedBuckets() {
    const bucketDefinitions = [
      { label: '30-90 天', startDays: 30, endDays: 90 },
      { label: '90-180 天', startDays: 90, endDays: 180 },
      { label: '180-365 天', startDays: 180, endDays: 365 },
      { label: '365 天以上', startDays: 365, endDays: null }
    ] as const

    const results = await Promise.all(bucketDefinitions.map(async (bucket) => {
      const lowerBoundCondition = sql`(
        (${resourceStat.lastAccessTime} is not null and ${resourceStat.lastAccessTime} < strftime('%s', 'now', ${`-${bucket.startDays} days`}))
        or
        (${resourceStat.lastAccessTime} is null and ${resource.createTime} < strftime('%s', 'now', ${`-${bucket.startDays} days`}))
      )`

      const upperBoundCondition = bucket.endDays == null
        ? undefined
        : sql`(
          (${resourceStat.lastAccessTime} is not null and ${resourceStat.lastAccessTime} >= strftime('%s', 'now', ${`-${bucket.endDays} days`}))
          or
          (${resourceStat.lastAccessTime} is null and ${resource.createTime} >= strftime('%s', 'now', ${`-${bucket.endDays} days`}))
        )`

      const whereClause = upperBoundCondition
        ? and(eq(resource.isDeleted, false), lowerBoundCondition, upperBoundCondition)
        : and(eq(resource.isDeleted, false), lowerBoundCondition)

      const rows = await db
        .select({ total: count(resource.id) })
        .from(resource)
        .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
        .where(whereClause)

      return {
        label: bucket.label,
        value: Number(rows[0]?.total ?? 0)
      }
    }))

    return results
  }

  static async getDashboardAddedTrend(days = 14) {
    const normalizedDays = Math.max(7, Math.min(30, Math.floor(Number(days) || 14)))
    const rows = await db
      .select({
        date: sql<string>`strftime('%Y-%m-%d', ${resource.createTime}, 'unixepoch', 'localtime')`,
        count: count(resource.id)
      })
      .from(resource)
      .where(and(
        eq(resource.isDeleted, false),
        sql`${resource.createTime} >= strftime('%s', 'now', ${`-${normalizedDays - 1} days`})`
      ))
      .groupBy(sql`strftime('%Y-%m-%d', ${resource.createTime}, 'unixepoch', 'localtime')`)
      .orderBy(sql`strftime('%Y-%m-%d', ${resource.createTime}, 'unixepoch', 'localtime')`)

    const countByDate = new Map(rows.map((item) => [String(item.date ?? ''), Number(item.count ?? 0)]))
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return Array.from({ length: normalizedDays }, (_, index) => {
      const date = new Date(today)
      date.setDate(today.getDate() - (normalizedDays - index - 1))
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      return {
        date: dateKey,
        count: countByDate.get(dateKey) ?? 0
      }
    })
  }

  static async getRecentResourceLogs(page = 1, pageSize = 10) {
    await this.ensureCategoryPillColorColumn()

    const normalizedPage = Math.max(1, Math.floor(Number(page) || 1))
    const normalizedPageSize = Math.max(1, Math.min(50, Math.floor(Number(pageSize) || 10)))
    const whereClause = and(
      eq(resourceLog.isDeleted, false),
      eq(resource.isDeleted, false),
      eq(category.isDeleted, false),
      sql`${resourceLog.startTime} is not null`
    )

    const totalResult = await db
      .select({ total: count(resourceLog.resourceId) })
      .from(resourceLog)
      .innerJoin(resource, eq(resourceLog.resourceId, resource.id))
      .innerJoin(category, eq(resource.categoryId, category.id))
      .where(whereClause)

    const items = await db
      .select({
        resourceId: resource.id,
        title: resource.title,
        categoryId: resource.categoryId,
        categoryName: category.name,
        categoryEmoji: category.emoji,
        categoryPillColor: category.pillColor,
        startTime: resourceLog.startTime,
        endTime: resourceLog.endTime,
        duration: resourceLog.duration,
        launchMode: resourceLog.launchMode
      })
      .from(resourceLog)
      .innerJoin(resource, eq(resourceLog.resourceId, resource.id))
      .innerJoin(category, eq(resource.categoryId, category.id))
      .where(whereClause)
      .orderBy(desc(resourceLog.startTime), asc(resource.title))
      .limit(normalizedPageSize)
      .offset((normalizedPage - 1) * normalizedPageSize)

    return {
      items,
      total: Number(totalResult[0]?.total ?? 0),
      page: normalizedPage,
      pageSize: normalizedPageSize
    }
  }

  static async getTagByCategoryId(categoryId: string) {
    const tagCount = count(tag.id)

    return db
      .select({
        tagId: tag.id,
        tagName: tag.name,
        count: tagCount,
      })
      .from(resource)
      .leftJoin(tagResource, eq(resource.id, tagResource.resourceId))
      .leftJoin(tag, eq(tagResource.tagId, tag.id))
      .where(and(
        eq(resource.categoryId, categoryId),
        eq(resource.isDeleted, false),
        eq(tag.isDeleted, false)
      ))
      .groupBy(tag.id, tag.name)
      .orderBy(desc(tagCount))
  }

  static async getTypeByCategoryId(categoryId: string) {
    const typeCount = count(resourceType.id)

    return db
      .select({
        typeId: resourceType.id,
        typeName: resourceType.name,
        count: typeCount,
      })
      .from(resource)
      .leftJoin(typeResource, eq(resource.id, typeResource.resourceId))
      .leftJoin(resourceType, eq(typeResource.typeId, resourceType.id))
      .where(and(
        eq(resource.categoryId, categoryId),
        eq(resource.isDeleted, false),
        eq(resourceType.isDeleted, false)
      ))
      .groupBy(resourceType.id, resourceType.name)
      .orderBy(desc(typeCount))
  }

  static async getAuthorByCategoryId(categoryId: string) {
    const authorCount = count(author.id)

    return db
      .select({
        authorId: author.id,
        authorName: author.name,
        count: authorCount,
      })
      .from(resource)
      .leftJoin(authorWork, eq(resource.id, authorWork.resourceId))
      .leftJoin(author, eq(authorWork.authorId, author.id))
      .where(and(
        eq(resource.categoryId, categoryId),
        eq(resource.isDeleted, false),
        eq(authorWork.isDeleted, false),
        eq(author.isDeleted, false)
      ))
      .groupBy(author.id, author.name)
      .orderBy(desc(authorCount))
  }

  static async getActorByCategoryId(categoryId: string) {
    const actorCount = count(actor.id)

    return db
      .select({
        actorName: actor.name,
        count: actorCount,
      })
      .from(resource)
      .leftJoin(actor, eq(resource.id, actor.resourceId))
      .where(and(
        eq(resource.categoryId, categoryId),
        eq(resource.isDeleted, false),
        eq(actor.isDeleted, false),
        sql`${actor.name} is not null`,
        sql`trim(${actor.name}) <> ''`
      ))
      .groupBy(actor.name)
      .orderBy(desc(actorCount), asc(actor.name))
  }

  static async getAlbumByCategoryId(categoryId: string) {
    const albumCount = count(audioMeta.resourceId)

    return db
      .select({
        albumName: audioMeta.album,
        count: albumCount,
      })
      .from(resource)
      .leftJoin(audioMeta, eq(resource.id, audioMeta.resourceId))
      .where(and(
        eq(resource.categoryId, categoryId),
        eq(resource.isDeleted, false),
        sql`${audioMeta.album} is not null`,
        sql`trim(${audioMeta.album}) <> ''`
      ))
      .groupBy(audioMeta.album)
      .orderBy(desc(albumCount), asc(audioMeta.album))
  }

  static async getEngineByCategoryId(categoryId: string) {
    const engineCount = count(dictData.id)

    return db
      .select({
        engineId: dictData.id,
        engineName: dictData.name,
        extra: dictData.extra,
        count: engineCount,
      })
      .from(resource)
      .leftJoin(gameMeta, eq(resource.id, gameMeta.resourceId))
      .leftJoin(dictData, eq(gameMeta.engine, dictData.id))
      .where(and(
        eq(resource.categoryId, categoryId),
        eq(resource.isDeleted, false),
        sql`${gameMeta.engine} is not null`,
        eq(dictData.isDeleted, false)
      ))
      .groupBy(dictData.id, dictData.name)
      .orderBy(desc(engineCount))
  }

  static async getMissingResourceCountByCategoryId(categoryId: string) {
    const result = await db
      .select({ total: count(resource.id) })
      .from(resource)
      .where(and(
        eq(resource.categoryId, categoryId),
        eq(resource.isDeleted, false),
        eq(resource.missingStatus, true)
      ))

    return Number(result[0]?.total ?? 0)
  }

  static async getFavoriteResourceCountByCategoryId(categoryId: string) {
    const result = await db
      .select({ total: count(resource.id) })
      .from(resource)
      .where(and(
        eq(resource.categoryId, categoryId),
        eq(resource.isDeleted, false),
        eq(resource.ifFavorite, true)
      ))

    return Number(result[0]?.total ?? 0)
  }

  static async getCompletedResourceCountByCategoryId(categoryId: string) {
    const result = await db
      .select({ total: count(resource.id) })
      .from(resource)
      .where(and(
        eq(resource.categoryId, categoryId),
        eq(resource.isDeleted, false),
        eq(resource.isCompleted, true)
      ))

    return Number(result[0]?.total ?? 0)
  }

  static async getRunningResourceCountByCategoryId(categoryId: string) {
    const result = await db
      .select({ total: count(resource.id) })
      .from(resource)
      .where(and(
        eq(resource.categoryId, categoryId),
        eq(resource.isDeleted, false),
        sql`exists (
          select 1
          from ${resourceLog}
          where ${resourceLog.resourceId} = ${resource.id}
            and coalesce(${resourceLog.isDeleted}, 0) = 0
            and ${resourceLog.endTime} is null
        )`
      ))

    return Number(result[0]?.total ?? 0)
  }

  static async getSelectDictData(dictTypeName: string) {
    return db.select({
      label: dictData.name,
      value: dictData.id,
      description: dictData.description,
      extra: dictData.extra,
    }).from(dictType)
      .leftJoin(dictData, eq(dictType.id, dictData.typeId))
      .where(and(
        eq(dictType.name, dictTypeName),
        eq(dictData.isDeleted, false)
      ))
  }

  static async getAuthor(name: string) {
    return await db.query.author.findFirst({
      where: and(
        eq(author.name, name),
        eq(author.isDeleted, false)
      )
    })
  }

  static async getTagByCategoryIdWithName(categoryId: string, tags: string[]) {
    return await db.query.tag.findMany({
      where: and(
        eq(tag.categoryId, categoryId),
        eq(tag.isDeleted, false),
        inArray(tag.name, tags)
      )
    })
  }

  static async getTypeByCategoryIdWithName(categoryId: string, types: string[]) {
    return await db.query.resourceType.findMany({
      where: and(
        eq(resourceType.categoryId, categoryId),
        eq(resourceType.isDeleted, false),
        inArray(resourceType.name, types)
      )
    })
  }

  static insertResource(resourceData: typeof resource.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.insert(resource).values(resourceData).run()
  }

  static insertAuthor(authorData: typeof author.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.insert(author).values(authorData).run()
  }

  static insertAuthorRef(authorRefData: typeof authorWork.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.insert(authorWork).values(authorRefData).run()
  }

  static deleteAuthorRefsByResourceId(resourceId: string, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.delete(authorWork).where(eq(authorWork.resourceId, resourceId)).run()
  }

  static insertActors(actorList: (typeof actor.$inferInsert)[], tx?: DbExecutor) {
    if (!actorList.length) return
    const executor = tx ?? db
    executor.insert(actor).values(actorList).run()
  }

  static deleteActorsByResourceId(resourceId: string, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.delete(actor).where(eq(actor.resourceId, resourceId)).run()
  }

  static insertTags(tagList: (typeof tag.$inferInsert)[], tx?: DbExecutor) {
    if (!tagList.length) return
    const executor = tx ?? db
    executor.insert(tag).values(tagList).run()
  }

  static insertTagRefs(tagRefList: (typeof tagResource.$inferInsert)[], tx?: DbExecutor) {
    if (!tagRefList.length) return
    const executor = tx ?? db
    executor.insert(tagResource).values(tagRefList).run()
  }

  static deleteTagRefsByResourceId(resourceId: string, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.delete(tagResource).where(eq(tagResource.resourceId, resourceId)).run()
  }

  static insertTypes(typeList: (typeof resourceType.$inferInsert)[], tx?: DbExecutor) {
    if (!typeList.length) return
    const executor = tx ?? db
    executor.insert(resourceType).values(typeList).run()
  }

  static insertTypeRefs(typeRefList: (typeof typeResource.$inferInsert)[], tx?: DbExecutor) {
    if (!typeRefList.length) return
    const executor = tx ?? db
    executor.insert(typeResource).values(typeRefList).run()
  }

  static deleteTypeRefsByResourceId(resourceId: string, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.delete(typeResource).where(eq(typeResource.resourceId, resourceId)).run()
  }

  static insertStoreWork(storeWorkData: typeof storeWork.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.insert(storeWork).values(storeWorkData).run()
  }

  static deleteStoreWorkByResourceId(resourceId: string, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.delete(storeWork).where(eq(storeWork.resourceId, resourceId)).run()
  }

  static insertGameMeta(metaData: typeof gameMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.insert(gameMeta).values(metaData).run()
  }

  static upsertGameMeta(metaData: typeof gameMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .insert(gameMeta)
      .values(metaData)
      .onConflictDoUpdate({
        target: gameMeta.resourceId,
        set: {
          nameZh: metaData.nameZh ?? null,
          nameEn: metaData.nameEn ?? null,
          nameJp: metaData.nameJp ?? null,
          nickname: metaData.nickname ?? null,
          engine: metaData.engine ?? null,
          version: metaData.version ?? null,
          language: metaData.language ?? null,
        }
      })
      .run()
  }

  static insertSoftwareMeta(metaData: typeof softwareMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.insert(softwareMeta).values(metaData).run()
  }

  static upsertSoftwareMeta(metaData: typeof softwareMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .insert(softwareMeta)
      .values(metaData)
      .onConflictDoUpdate({
        target: softwareMeta.resourceId,
        set: {
          version: metaData.version ?? null,
          commandLineArgs: metaData.commandLineArgs ?? null,
        }
      })
      .run()
  }

  static insertSingleImageMeta(metaData: typeof singleImageMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.insert(singleImageMeta).values(metaData).run()
  }

  static upsertSingleImageMeta(metaData: typeof singleImageMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .insert(singleImageMeta)
      .values(metaData)
      .onConflictDoUpdate({
        target: singleImageMeta.resourceId,
        set: {
          resolution: metaData.resolution ?? null,
          format: metaData.format ?? null,
          source: metaData.source ?? null,
        }
      })
      .run()
  }

  static insertMultiImageMeta(metaData: typeof multiImageMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.insert(multiImageMeta).values(metaData).run()
  }

  static upsertMultiImageMeta(metaData: typeof multiImageMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .insert(multiImageMeta)
      .values(metaData)
      .onConflictDoUpdate({
        target: multiImageMeta.resourceId,
        set: {
          pageCount: metaData.pageCount ?? null,
          translator: metaData.translator ?? null,
          lastReadPage: metaData.lastReadPage ?? undefined,
        }
      })
      .run()
  }

  static async getMultiImageReadingProgress(resourceId: string, tx?: DbExecutor) {
    const executor = tx ?? db
    const item = await executor.query.multiImageMeta.findFirst({
      where: eq(multiImageMeta.resourceId, resourceId)
    })

    return Number(item?.lastReadPage ?? 0)
  }

  static upsertMultiImageReadingProgress(resourceId: string, lastReadPage: number, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .insert(multiImageMeta)
      .values({
        resourceId,
        lastReadPage
      })
      .onConflictDoUpdate({
        target: multiImageMeta.resourceId,
        set: {
          lastReadPage
        }
      })
      .run()
  }

  static insertVideoMeta(metaData: typeof videoMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.insert(videoMeta).values(metaData).run()
  }

  static upsertVideoMeta(metaData: typeof videoMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .insert(videoMeta)
      .values(metaData)
      .onConflictDoUpdate({
        target: videoMeta.resourceId,
        set: {
          year: metaData.year ?? null,
          lastPlayFile: metaData.lastPlayFile ?? null,
          lastPlayTime: metaData.lastPlayTime ?? null,
        }
      })
      .run()
  }

  static getMediaSubsByResourceId(resourceId: string, tx?: DbExecutor) {
    const executor = tx ?? db
    return executor.query.mediaSub.findMany({
      where: eq(mediaSub.resourceId, resourceId),
      orderBy: [asc(mediaSub.sortOrder), asc(mediaSub.fileName)]
    })
  }

  static deleteMediaSubsByResourceId(resourceId: string, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.delete(mediaSub).where(eq(mediaSub.resourceId, resourceId)).run()
  }

  static insertMediaSubs(items: Array<typeof mediaSub.$inferInsert>, tx?: DbExecutor) {
    if (!items.length) {
      return
    }

    const executor = tx ?? db
    executor.insert(mediaSub).values(items).run()
  }

  static replaceMediaSubs(resourceId: string, items: Array<typeof mediaSub.$inferInsert>, tx?: DbExecutor) {
    this.deleteMediaSubsByResourceId(resourceId, tx)
    this.insertMediaSubs(items, tx)
  }

  static getVideoSubsByResourceId(resourceId: string, tx?: DbExecutor) {
    return this.getMediaSubsByResourceId(resourceId, tx).then((items) =>
      items.filter((item) => String(item?.kind ?? '') === 'video')
    )
  }

  static replaceVideoSubs(resourceId: string, items: Array<typeof mediaSub.$inferInsert>, tx?: DbExecutor) {
    this.replaceMediaSubs(resourceId, items, tx)
  }

  static updateVideoPlaybackProgress(resourceId: string, lastPlayFile: string, lastPlayTime: number, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .insert(videoMeta)
      .values({
        resourceId,
        lastPlayFile,
        lastPlayTime,
      })
      .onConflictDoUpdate({
        target: videoMeta.resourceId,
        set: {
          lastPlayFile,
          lastPlayTime,
        }
      })
      .run()
  }

  static insertAsmrMeta(metaData: typeof asmrMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.insert(asmrMeta).values(metaData).run()
  }

  static upsertAsmrMeta(metaData: typeof asmrMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .insert(asmrMeta)
      .values(metaData)
      .onConflictDoUpdate({
        target: asmrMeta.resourceId,
        set: {
          cv: metaData.cv ?? null,
          duration: metaData.duration ?? null,
          illust: metaData.illust ?? null,
          lastPlayFile: metaData.lastPlayFile ?? null,
          lastPlayTime: metaData.lastPlayTime ?? null,
          language: metaData.language ?? null,
          scenario: metaData.scenario ?? null,
        }
      })
      .run()
  }

  static updateAsmrDuration(resourceId: string, duration: number, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .insert(asmrMeta)
      .values({
        resourceId,
        duration,
      })
      .onConflictDoUpdate({
        target: asmrMeta.resourceId,
        set: {
          duration,
        }
      })
      .run()
  }

  static updateAsmrPlaybackProgress(resourceId: string, lastPlayFile: string, lastPlayTime: number, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .insert(asmrMeta)
      .values({
        resourceId,
        lastPlayFile,
        lastPlayTime,
      })
      .onConflictDoUpdate({
        target: asmrMeta.resourceId,
        set: {
          lastPlayFile,
          lastPlayTime,
        }
      })
      .run()
  }

  static insertAudioMeta(metaData: typeof audioMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.insert(audioMeta).values(metaData).run()
  }

  static upsertAudioMeta(metaData: typeof audioMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .insert(audioMeta)
      .values(metaData)
      .onConflictDoUpdate({
        target: audioMeta.resourceId,
        set: {
          artist: metaData.artist ?? null,
          album: metaData.album ?? null,
          lyricsPath: metaData.lyricsPath ?? null,
          duration: metaData.duration ?? null,
          lastPlayTime: metaData.lastPlayTime ?? 0,
        }
      })
      .run()
  }

  static updateAudioPlaybackProgress(resourceId: string, lastPlayTime: number, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .insert(audioMeta)
      .values({
        resourceId,
        lastPlayTime,
      })
      .onConflictDoUpdate({
        target: audioMeta.resourceId,
        set: {
          lastPlayTime,
        }
      })
      .run()
  }

  static insertNovelMeta(metaData: typeof novelMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.insert(novelMeta).values(metaData).run()
  }

  static upsertNovelMeta(metaData: typeof novelMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .insert(novelMeta)
      .values(metaData)
      .onConflictDoUpdate({
        target: novelMeta.resourceId,
        set: {
          translator: metaData.translator ?? null,
          isbn: metaData.isbn ?? null,
          publisher: metaData.publisher ?? null,
          year: metaData.year ?? null,
          lastReadPercent: metaData.lastReadPercent ?? undefined,
        }
      })
      .run()
  }

  static async getNovelReadingProgress(resourceId: string, tx?: DbExecutor) {
    const executor = tx ?? db
    const item = await executor.query.novelMeta.findFirst({
      where: eq(novelMeta.resourceId, resourceId)
    })

    return Number(item?.lastReadPercent ?? 0)
  }

  static upsertNovelReadingProgress(resourceId: string, lastReadPercent: number, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .insert(novelMeta)
      .values({
        resourceId,
        lastReadPercent,
      })
      .onConflictDoUpdate({
        target: novelMeta.resourceId,
        set: {
          lastReadPercent,
        }
      })
      .run()
  }

  static insertWebsiteMeta(metaData: typeof websiteMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor.insert(websiteMeta).values(metaData).run()
  }

  static upsertWebsiteMeta(metaData: typeof websiteMeta.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .insert(websiteMeta)
      .values(metaData)
      .onConflictDoUpdate({
        target: websiteMeta.resourceId,
        set: {
          url: metaData.url ?? null,
          favicon: metaData.favicon ?? null,
          isDownloadLink: metaData.isDownloadLink ?? false,
        }
      })
      .run()
  }

  static async insertResourceLog(logData: typeof resourceLog.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    await executor
      .insert(resourceLog)
      .values(logData)
  }

  static async getLatestActiveResourceLogByResourceId(resourceId: string, tx?: DbExecutor) {
    const executor = tx ?? db
    return executor.query.resourceLog.findFirst({
      where: and(
        eq(resourceLog.resourceId, resourceId),
        eq(resourceLog.isDeleted, false),
        sql`${resourceLog.endTime} is null`
      ),
      orderBy: [desc(resourceLog.startTime)],
    })
  }

  static async getLatestActiveResourceLogByPid(pid: number, tx?: DbExecutor) {
    const executor = tx ?? db
    return executor.query.resourceLog.findFirst({
      where: and(
        eq(resourceLog.pid, pid),
        eq(resourceLog.isDeleted, false),
        sql`${resourceLog.endTime} is null`
      ),
      orderBy: [desc(resourceLog.startTime)],
    })
  }

  static async getActiveResourceLogsWithPid(tx?: DbExecutor) {
    const executor = tx ?? db
    return executor.query.resourceLog.findMany({
      where: and(
        eq(resourceLog.isDeleted, false),
        sql`${resourceLog.endTime} is null`,
        sql`${resourceLog.pid} is not null`
      ),
    })
  }

  static async getRunningResourceSummary(tx?: DbExecutor) {
    const executor = tx ?? db
    const activeItems = await executor
      .select({
        resourceId: resource.id,
        title: resource.title,
      })
      .from(resourceLog)
      .innerJoin(resource, eq(resourceLog.resourceId, resource.id))
      .where(and(
        eq(resourceLog.isDeleted, false),
        eq(resource.isDeleted, false),
        sql`${resourceLog.endTime} is null`
      ))
      .groupBy(resource.id, resource.title)
      .orderBy(asc(resource.title))

    return {
      count: activeItems.length,
      titles: activeItems.map((item) => String(item.title ?? '').trim()).filter(Boolean)
    }
  }

  static async markActiveResourceLogsAsUnknownEnded(tx?: DbExecutor) {
    const executor = tx ?? db
    const unknownEndTime = new Date(ResourceLogSpecialTime.UNKNOWN_END_TIME)

    const result = await executor
      .update(resourceLog)
      .set({
        endTime: unknownEndTime,
        duration: 0,
        pid: null,
      })
      .where(and(
        eq(resourceLog.isDeleted, false),
        sql`${resourceLog.endTime} is null`
      ))

    return Number(result?.changes ?? 0)
  }

  static async closeActiveResourceLog(
    resourceId: string,
    options: {
      pid?: number | null
      startTime?: Date | null
      endTime: Date
      duration: number
    },
    tx?: DbExecutor
  ) {
    const executor = tx ?? db
    const conditions = [
      eq(resourceLog.resourceId, resourceId),
      eq(resourceLog.isDeleted, false),
      sql`${resourceLog.endTime} is null`
    ]

    if (typeof options.pid === 'number') {
      conditions.push(eq(resourceLog.pid, options.pid))
    }

    if (options.startTime) {
      conditions.push(eq(resourceLog.startTime, options.startTime))
    }

    await executor
      .update(resourceLog)
      .set({
        endTime: options.endTime,
        duration: options.duration,
        pid: null,
      })
      .where(and(...conditions))
  }

  static async bumpResourceStatOnLaunch(resourceId: string, accessTime: Date, tx?: DbExecutor) {
    const executor = tx ?? db
    const existing = await executor.query.resourceStat.findFirst({
      where: eq(resourceStat.resourceId, resourceId),
    })

    if (!existing) {
      await executor.insert(resourceStat).values({
        resourceId,
        firstAccessTime: accessTime,
        lastAccessTime: accessTime,
        accessCount: 1,
        totalRuntime: 0,
      })
      return
    }

    await executor
      .update(resourceStat)
      .set({
        firstAccessTime: existing.firstAccessTime ?? accessTime,
        lastAccessTime: accessTime,
        accessCount: Number(existing.accessCount ?? 0) + 1,
      })
      .where(eq(resourceStat.resourceId, resourceId))
  }

  static async bumpResourceStatOnStop(resourceId: string, duration: number, stopTime: Date, tx?: DbExecutor) {
    const executor = tx ?? db
    const existing = await executor.query.resourceStat.findFirst({
      where: eq(resourceStat.resourceId, resourceId),
    })

    if (!existing) {
      await executor.insert(resourceStat).values({
        resourceId,
        firstAccessTime: stopTime,
        lastAccessTime: stopTime,
        accessCount: 0,
        totalRuntime: Math.max(0, duration),
      })
      return
    }

    await executor
      .update(resourceStat)
      .set({
        firstAccessTime: existing.firstAccessTime ?? stopTime,
        lastAccessTime: existing.lastAccessTime ?? stopTime,
        accessCount: Number(existing.accessCount ?? 0),
        totalRuntime: Number(existing.totalRuntime ?? 0) + Math.max(0, duration),
      })
      .where(eq(resourceStat.resourceId, resourceId))
  }

  static async getResourceById(resourceId: string) {
    await this.ensureResourceTopAndHomePinSchema()

    return await db.query.resource.findFirst({
      where: and(
        eq(resource.id, resourceId),
        eq(resource.isDeleted, false)
      )
    })
  }

  static async getResourcesByIds(resourceIds: string[]) {
    await this.ensureResourceTopAndHomePinSchema()

    const normalizedIds = resourceIds.filter(Boolean)
    if (!normalizedIds.length) {
      return []
    }

    return db.query.resource.findMany({
      where: and(
        inArray(resource.id, normalizedIds),
        eq(resource.isDeleted, false)
      )
    })
  }

  static async getRunningResourceIdsByResourceIds(resourceIds: string[]) {
    const normalizedIds = resourceIds.filter(Boolean)
    if (!normalizedIds.length) {
      return []
    }

    const rows = await db
      .select({ resourceId: resourceLog.resourceId })
      .from(resourceLog)
      .where(and(
        inArray(resourceLog.resourceId, normalizedIds),
        eq(resourceLog.isDeleted, false),
        sql`${resourceLog.endTime} is null`
      ))
      .groupBy(resourceLog.resourceId)

    return rows
      .map((item) => String(item.resourceId ?? '').trim())
      .filter(Boolean)
  }

  static async getResourceByStoragePath(basePath: string, fileName: string | null) {
    await this.ensureResourceTopAndHomePinSchema()

    const conditions = [
      eq(resource.basePath, basePath),
      eq(resource.isDeleted, false)
    ]

    if (fileName === null) {
      conditions.push(sql`${resource.fileName} is null`)
    } else {
      conditions.push(eq(resource.fileName, fileName))
    }

    return await db.query.resource.findFirst({
      where: and(...conditions)
    })
  }

  static async getResourceDetailById(resourceId: string) {
    await this.ensureResourceTopAndHomePinSchema()

    const item = await db.query.resource.findFirst({
      where: and(
        eq(resource.id, resourceId),
        eq(resource.isDeleted, false)
      ),
        with: {
          stats: true,
          logs: true,
          gameMeta: true,
          softwareMeta: true,
          singleImageMeta: true,
          multiImageMeta: true,
          videoMeta: true,
          mediaSubs: true,
          asmrMeta: true,
          audioMeta: true,
          novelMeta: true,
          websiteMeta: true,
          actors: true,
          stores: {
            with: {
              store: true
            }
          },
          tags: {
            with: {
              tag: true
          }
        },
        types: {
          with: {
            type: true
          }
        },
        authors: {
          with: {
            author: true
          }
        }
      }
    })

    if (!item) {
      return null
    }

    const currentHomePin = await db.query.homePin.findFirst({
      where: and(
        eq(homePin.resourceId, resourceId),
        eq(homePin.isDeleted, false)
      )
    })

    return {
      ...item,
      homePinnedAt: currentHomePin?.pinnedAt ?? null,
      isRunning: Array.isArray(item.logs)
        ? item.logs.some((logItem) => !logItem.isDeleted && !logItem.endTime)
        : false,
      actors: item.actors,
      videoSubs: item.mediaSubs.filter((subItem) => String(subItem?.kind ?? '') === 'video'),
      asmrSubs: item.mediaSubs,
      tags: item.tags.map((tagItem) => tagItem.tag),
      types: item.types.map((typeItem) => typeItem.type),
      authors: item.authors.map((authorItem) => authorItem.author)
    }
  }

  static async updateResource(
    resourceData: Partial<typeof resource.$inferInsert> & Pick<typeof resource.$inferInsert, 'id'>,
    tx?: DbExecutor
  ) {
    await this.ensureResourceTopAndHomePinSchema()
    const executor = tx ?? db
    executor.update(resource).set(resourceData).where(eq(resource.id, resourceData.id)).run()
  }

  static async pinResourceToHome(resourceId: string, pinnedAt: Date = new Date(), tx?: DbExecutor) {
    await this.ensureResourceTopAndHomePinSchema()
    const executor = tx ?? db
    const existing = await executor.query.homePin.findFirst({
      where: eq(homePin.resourceId, resourceId)
    })

    if (existing) {
      await executor
        .update(homePin)
        .set({
          pinnedAt,
          isDeleted: false
        })
        .where(eq(homePin.resourceId, resourceId))
      return
    }

    await executor.insert(homePin).values({
      resourceId,
      pinnedAt,
      isDeleted: false
    })
  }

  static async unpinResourceFromHome(resourceId: string, tx?: DbExecutor) {
    await this.ensureResourceTopAndHomePinSchema()
    const executor = tx ?? db
    await executor
      .update(homePin)
      .set({ isDeleted: true })
      .where(eq(homePin.resourceId, resourceId))
  }

  static async getHomePinByResourceId(resourceId: string, tx?: DbExecutor) {
    await this.ensureResourceTopAndHomePinSchema()
    const executor = tx ?? db
    return await executor.query.homePin.findFirst({
      where: and(
        eq(homePin.resourceId, resourceId),
        eq(homePin.isDeleted, false)
      )
    })
  }

  static async logicalDeleteResource(resourceId: string, tx?: DbExecutor) {
    const executor = tx ?? db
    executor
      .update(resource)
      .set({ isDeleted: true })
      .where(eq(resource.id, resourceId))
      .run()
  }

  static async logicalDeleteResources(resourceIds: string[], tx?: DbExecutor) {
    const normalizedIds = Array.from(new Set((resourceIds ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)))
    if (!normalizedIds.length) {
      return 0
    }

    const executor = tx ?? db
    const result = await executor
      .update(resource)
      .set({ isDeleted: true })
      .where(inArray(resource.id, normalizedIds))

    return Number(result?.changes ?? normalizedIds.length)
  }

  static async getWatcherResources() {
    const items = await db.select({
      id: resource.id,
      categoryId: resource.categoryId,
      basePath: resource.basePath,
      fileName: resource.fileName,
      missingStatus: resource.missingStatus,
      categoryExtra: dictData.extra,
    })
      .from(resource)
      .leftJoin(category, eq(resource.categoryId, category.id))
      .leftJoin(dictData, eq(category.referenceId, dictData.id))
      .where(and(
        eq(resource.isDeleted, false),
        sql`not exists (
          select 1
          from ${websiteMeta}
          where ${websiteMeta.resourceId} = ${resource.id}
        )`
      ))

    return items.map((item) => {
      const extendTable = String(item?.categoryExtra?.extendTable ?? '').trim()
      const resourcePathType = String(item?.categoryExtra?.resourcePathType ?? '').trim()
      const directoryMetadataKind =
        extendTable === 'video_meta' && resourcePathType === 'folder'
          ? 'video'
          : extendTable === 'asmr_meta' && resourcePathType === 'folder'
            ? 'asmr'
            : null

      return {
        id: item.id,
        categoryId: item.categoryId,
        basePath: item.basePath,
        fileName: item.fileName,
        missingStatus: item.missingStatus,
        directoryMetadataKind: directoryMetadataKind as 'video' | 'asmr' | null
      }
    })
  }

  static async getDictTypeByName(name: string) {
    return db.query.dictType.findFirst({
      where: and(eq(dictType.name, name), eq(dictType.isDeleted, false))
    })
  }

  static async getDictDataByTypeAndDataName(typeId: string, name: string) {
    return db.query.dictData.findFirst({
      where: and(
        eq(dictData.typeId, typeId),
        eq(dictData.name, name),
        eq(dictData.isDeleted, false)
      )
    })
  }

  static async insertDictType(typeData: typeof dictType.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    return executor.insert(dictType).values(typeData).run()
  }

  static async insertDictData(dataData: typeof dictData.$inferInsert, tx?: DbExecutor) {
    const executor = tx ?? db
    return executor.insert(dictData).values(dataData).run()
  }

  static async getDictDataById(id: string) {
    return db.query.dictData.findFirst({
      where: and(eq(dictData.id, id), eq(dictData.isDeleted, false))
    })
  }

  static async updateDictData(data: Partial<typeof dictData.$inferInsert> & Pick<typeof dictData.$inferInsert, 'id'>, tx?: DbExecutor) {
    const executor = tx ?? db
    return executor.update(dictData).set(data).where(eq(dictData.id, data.id)).run()
  }
}
