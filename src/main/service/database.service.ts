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
  actor, gameMeta, softwareMeta, singleImageMeta, multiImageMeta, videoMeta, asmrMeta, audioMeta, novelMeta, websiteMeta,
} from '../db/schema'
import {and, asc, count, desc, eq, inArray, sql} from 'drizzle-orm'
import {generateId} from '../util/id-generator'
import { ResourceLogSpecialTime, SettingDetail } from "../../common/constants";

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

export class DatabaseService {
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
    return db
      .select({
        id: category.id,
        name: category.name,
        emoji: category.emoji,
        sort: category.sort,
        extra: dictData.extra,
      })
      .from(category)
      .leftJoin(dictData, eq(category.referenceId, dictData.id))
      .where(eq(category.isDeleted, false))
      .orderBy(asc(category.sort))
  }

  static async getCategoryById(id: string) {
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
    const page = Math.max(1, Number(query.page ?? 1))
    const pageSize = Math.max(1, Number(query.pageSize ?? 24))
    const whereClause = and(...this.buildResourceFilterConditions(categoryId, query))

    const totalResult = await db
      .select({ total: count(resource.id) })
      .from(resource)
      .where(whereClause)

    const total = Number(totalResult[0]?.total ?? 0)

    const orderByClause = (() => {
      switch (query.sortBy) {
        case 'title-asc':
          return [asc(resource.title), desc(resource.createTime)]
        case 'title-desc':
          return [desc(resource.title), desc(resource.createTime)]
        case 'createTime-asc':
          return [asc(resource.createTime), asc(resource.title)]
        case 'lastAccessTime-desc':
          return [desc(resourceStat.lastAccessTime), desc(resource.createTime), asc(resource.title)]
        case 'lastAccessTime-asc':
          return [asc(resourceStat.lastAccessTime), asc(resource.createTime), asc(resource.title)]
        case 'totalRuntime-desc':
          return [desc(resourceStat.totalRuntime), desc(resource.createTime), asc(resource.title)]
        case 'totalRuntime-asc':
          return [asc(resourceStat.totalRuntime), asc(resource.createTime), asc(resource.title)]
        case 'firstAccessTime-desc':
          return [desc(resourceStat.firstAccessTime), desc(resource.createTime), asc(resource.title)]
        case 'firstAccessTime-asc':
          return [asc(resourceStat.firstAccessTime), asc(resource.createTime), asc(resource.title)]
        case 'createTime-desc':
        default:
          return [desc(resource.createTime), asc(resource.title)]
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
      return {
        items: [],
        total,
        page,
        pageSize
      }
    }

    const resourceList = await db.query.resource.findMany({
      where: inArray(resource.id, resourceIds),
      with: {
        stats: true,
        logs: true,
        gameMeta: true,
        singleImageMeta: true,
        videoMeta: true,
        asmrMeta: true,
        audioMeta: true,
        novelMeta: true,
        actors: true,
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

    const resourceMap = new Map(resourceList.map((item) => [
      item.id,
      {
        ...item,
        isRunning: Array.isArray(item.logs)
          ? item.logs.some((logItem) => !logItem.isDeleted && !logItem.endTime)
          : false,
        actors: item.actors,
        tags: item.tags.map(tagItem => tagItem.tag),
        types: item.types.map(typeItem => typeItem.type),
        authors: item.authors.map(authorItem => authorItem.author)
      }
    ]))

    return {
      items: resourceIds.map((id) => resourceMap.get(id)).filter(Boolean),
      total,
      page,
      pageSize
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
          favicon: metaData.favicon ?? null,
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
    return await db.query.resource.findFirst({
      where: and(
        eq(resource.id, resourceId),
        eq(resource.isDeleted, false)
      )
    })
  }

  static async getResourcesByIds(resourceIds: string[]) {
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
          asmrMeta: true,
          audioMeta: true,
          novelMeta: true,
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

    return {
      ...item,
      isRunning: Array.isArray(item.logs)
        ? item.logs.some((logItem) => !logItem.isDeleted && !logItem.endTime)
        : false,
      actors: item.actors,
      tags: item.tags.map((tagItem) => tagItem.tag),
      types: item.types.map((typeItem) => typeItem.type),
      authors: item.authors.map((authorItem) => authorItem.author)
    }
  }

  static async updateResource(
    resourceData: Partial<typeof resource.$inferInsert> & Pick<typeof resource.$inferInsert, 'id'>,
    tx?: DbExecutor
  ) {
    const executor = tx ?? db
    executor.update(resource).set(resourceData).where(eq(resource.id, resourceData.id)).run()
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
    return db.select({
      id: resource.id,
      categoryId: resource.categoryId,
      basePath: resource.basePath,
      fileName: resource.fileName,
      missingStatus: resource.missingStatus,
    }).from(resource)
      .where(eq(resource.isDeleted, false))
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
