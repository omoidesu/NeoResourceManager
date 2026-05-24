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
  resourceIssueIgnore,
  archivePackage,
  archivePackageItem,
} from '../db/schema'
import {and, asc, count, desc, eq, inArray, not, or, sql} from 'drizzle-orm'
import {generateId} from '../util/id-generator'
import { ResourceLogSpecialTime, SettingDetail, Settings } from "../../common/constants";
import { createLogger } from '../util/logger'
import path from 'path'
import fs from 'fs-extra'

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

type GovernanceIssueType = 'brokenPath' | 'missingCover' | 'longUnvisited' | 'duplicateResource'
type BrokenPathSubtypeKey = 'directoryMissing' | 'launchFileMissing'
type LongUnvisitedBucketKey = 'over1Month' | 'threeToSixMonths' | 'sixToTwelveMonths' | 'overOneYear'

type GovernanceIssueQuery = {
  issueType?: GovernanceIssueType | 'ignored' | 'all'
  brokenPathSubtype?: BrokenPathSubtypeKey | 'all'
  longUnvisitedBucket?: LongUnvisitedBucketKey | 'all'
  keyword?: string
  category?: string
  tag?: string
  status?: 'all' | '待处理' | '已忽略'
  rating?: 'all' | '4+' | '3+' | '0-3'
  onlyFavorite?: boolean
  onlyRecent?: boolean
  sortBy?: 'priority' | 'recent' | 'created'
}

type GovernanceBaseResourceRow = {
  id: string
  title: string
  categoryId: string
  categoryName: string
  categoryEmoji: string | null
  categoryPillColor: string | null
  categoryExtra?: {
    extendTable?: string | null
    resourcePathType?: string | null
    archiveEnabled?: boolean
    archiveMode?: 'file' | 'directory' | 'none' | string | null
  } | null
  coverPath: string | null
  description: string | null
  basePath: string
  fileName: string | null
  favorite: boolean | null
  rating: number | null
  missingStatus: boolean | null
  createTime: Date | null
  lastAccessTime: Date | null
  isWebsiteResource: boolean | null
  tagsText: string | null
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
  private static mediaSubSchemaReady = false
  private static resourceSearchTextColumnReady = false
  private static resourceIssueIgnoreSchemaReady = false
  private static archivePackageSchemaReady = false
  private static categoryArchivePolicyExtraReady = false

  private static resolveDefaultArchivePolicy(extra: {
    extendTable?: string | null
    resourcePathType?: string | null
  } | null | undefined) {
    const extendTable = String(extra?.extendTable ?? '').trim()
    const resourcePathType = String(extra?.resourcePathType ?? '').trim()

    if (extendTable === 'software_meta' || extendTable === 'website_meta') {
      return {
        archiveEnabled: false,
        archiveMode: 'none' as const
      }
    }

    if (
      extendTable === 'game_meta'
      || extendTable === 'multi_image_meta'
      || extendTable === 'asmr_meta'
    ) {
      return {
        archiveEnabled: true,
        archiveMode: 'directory' as const
      }
    }

    if (extendTable === 'video_meta') {
      return {
        archiveEnabled: true,
        archiveMode: resourcePathType === 'folder' ? 'directory' as const : 'file' as const
      }
    }

    if (
      extendTable === 'single_image_meta'
      || extendTable === 'audio_meta'
      || extendTable === 'novel_meta'
    ) {
      return {
        archiveEnabled: true,
        archiveMode: 'file' as const
      }
    }

    return {
      archiveEnabled: false,
      archiveMode: 'none' as const
    }
  }

  private static async ensureCategoryArchivePolicyExtra() {
    if (this.categoryArchivePolicyExtraReady) {
      return
    }

    const rows = await db
      .select({
        id: dictData.id,
        extra: dictData.extra
      })
      .from(dictData)
      .where(eq(dictData.isDeleted, false))

    for (const row of rows) {
      const currentExtra = (row.extra && typeof row.extra === 'object' ? row.extra : {}) as Record<string, any>
      const hasArchiveEnabled = typeof currentExtra.archiveEnabled === 'boolean'
      const hasArchiveMode = currentExtra.archiveMode === 'file'
        || currentExtra.archiveMode === 'directory'
        || currentExtra.archiveMode === 'none'

      if (hasArchiveEnabled && hasArchiveMode) {
        continue
      }

      const defaultPolicy = this.resolveDefaultArchivePolicy(currentExtra)
      await db
        .update(dictData)
        .set({
          extra: {
            ...currentExtra,
            archiveEnabled: hasArchiveEnabled ? currentExtra.archiveEnabled : defaultPolicy.archiveEnabled,
            archiveMode: hasArchiveMode ? currentExtra.archiveMode : defaultPolicy.archiveMode
          }
        })
        .where(eq(dictData.id, row.id))
    }

    this.categoryArchivePolicyExtraReady = true
  }

  static async ensureCategoryArchivePolicyDefaultsOnStartup() {
    this.categoryArchivePolicyExtraReady = false

    const rows = await db
      .select({
        id: dictData.id,
        extra: dictData.extra
      })
      .from(dictData)
      .where(eq(dictData.isDeleted, false))

    for (const row of rows) {
      const currentExtra = (row.extra && typeof row.extra === 'object' ? row.extra : {}) as Record<string, any>
      const hasArchiveEnabled = typeof currentExtra.archiveEnabled === 'boolean'
      const hasArchiveMode = currentExtra.archiveMode === 'file'
        || currentExtra.archiveMode === 'directory'
        || currentExtra.archiveMode === 'none'

      if (hasArchiveEnabled && hasArchiveMode) {
        continue
      }

      const defaultPolicy = this.resolveDefaultArchivePolicy(currentExtra)
      await db
        .update(dictData)
        .set({
          extra: {
            ...currentExtra,
            archiveEnabled: hasArchiveEnabled ? currentExtra.archiveEnabled : defaultPolicy.archiveEnabled,
            archiveMode: hasArchiveMode ? currentExtra.archiveMode : defaultPolicy.archiveMode
          }
        })
        .where(eq(dictData.id, row.id))
    }

    this.categoryArchivePolicyExtraReady = false
  }
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

  private static async ensureMediaSubSchema() {
    if (this.mediaSubSchemaReady) {
      return
    }

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS media_sub (
        id text PRIMARY KEY NOT NULL,
        resource_id text NOT NULL,
        file_name text NOT NULL,
        relative_path text NOT NULL,
        kind text NOT NULL DEFAULT 'video',
        cover_path text,
        sort_order integer DEFAULT 0,
        is_visible integer DEFAULT 1,
        has_subtitle integer DEFAULT 0,
        duration integer,
        bitrate integer,
        sample_rate integer,
        frame_rate real,
        audio_bitrate integer,
        audio_sample_rate integer,
        width integer,
        height integer,
        metadata_updated_at integer,
        FOREIGN KEY (resource_id) REFERENCES resource(id)
      )
    `)

    const legacyVideoSubTable = await db.get<{ name?: string }>(sql`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'video_sub'
      LIMIT 1
    `)

    if (String(legacyVideoSubTable?.name ?? '').trim() === 'video_sub') {
      await db.run(sql`
        INSERT OR IGNORE INTO media_sub (
          id,
          resource_id,
          file_name,
          relative_path,
          kind,
          cover_path,
          sort_order,
          is_visible,
          has_subtitle,
          duration,
          bitrate,
          sample_rate,
          frame_rate,
          audio_bitrate,
          audio_sample_rate,
          width,
          height,
          metadata_updated_at
        )
        SELECT
          id,
          resource_id,
          file_name,
          relative_path,
          'video',
          cover_path,
          COALESCE(sort_order, 0),
          COALESCE(is_visible, 1),
          0,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL
        FROM video_sub
      `)
    }

    this.mediaSubSchemaReady = true
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

  private static async ensureResourceIssueIgnoreSchema() {
    if (this.resourceIssueIgnoreSchemaReady) {
      return
    }

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS resource_issue_ignore (
        resource_id text NOT NULL,
        issue_type text NOT NULL,
        ignored_at integer DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (resource_id, issue_type),
        FOREIGN KEY (resource_id) REFERENCES resource(id)
      )
    `)

    this.resourceIssueIgnoreSchemaReady = true
  }

  private static async ensureArchivePackageSchema() {
    if (this.archivePackageSchemaReady) {
      return
    }

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS archive_package (
        id text PRIMARY KEY NOT NULL,
        package_title text NOT NULL,
        archive_path text NOT NULL,
        archive_format text NOT NULL,
        archive_level integer DEFAULT 9,
        password_enabled integer DEFAULT 0,
        archive_password text,
        split_size_mb integer,
        multithread_enabled integer DEFAULT 0,
        thread_count integer,
        source_total_size integer,
        archive_size integer,
        resource_count integer DEFAULT 1,
        status text DEFAULT 'completed',
        archived_at integer DEFAULT (strftime('%s', 'now')),
        is_deleted integer DEFAULT 0
      )
    `)
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS archive_package_item (
        id text PRIMARY KEY NOT NULL,
        package_id text NOT NULL,
        resource_id text NOT NULL,
        archive_entry_path text NOT NULL,
        source_path text NOT NULL,
        source_size integer,
        sort_order integer DEFAULT 0,
        is_deleted integer DEFAULT 0,
        FOREIGN KEY (package_id) REFERENCES archive_package(id),
        FOREIGN KEY (resource_id) REFERENCES resource(id)
      )
    `)
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_archive_package_path ON archive_package (archive_path)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_archive_package_archived_at ON archive_package (archived_at)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_archive_package_item_package_id ON archive_package_item (package_id)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_archive_package_item_resource_id ON archive_package_item (resource_id)`)

    const packageRows = await db.all(sql`PRAGMA table_info('archive_package')`) as Array<{ name?: string }>
    const packageColumns = new Set(packageRows.map((row) => String(row.name ?? '').trim()))
    if (!packageColumns.has('archive_password')) {
      await db.run(sql`ALTER TABLE archive_package ADD archive_password text`)
    }

    const itemRows = await db.all(sql`PRAGMA table_info('archive_package_item')`) as Array<{ name?: string }>
    const itemColumns = new Set(itemRows.map((row) => String(row.name ?? '').trim()))
    if (!itemColumns.has('archive_entry_path')) {
      await db.run(sql`ALTER TABLE archive_package_item ADD archive_entry_path text`)
      await db.run(sql`UPDATE archive_package_item SET archive_entry_path = source_path WHERE archive_entry_path IS NULL OR trim(archive_entry_path) = ''`)
    }

    this.archivePackageSchemaReady = true
  }


  private static buildGovernanceIssueDetail(issueType: GovernanceIssueType, row: GovernanceBaseResourceRow, thresholdDays: number) {
    if (issueType === 'brokenPath') {
      return '启动路径当前不可用，建议重新扫描或重定位。'
    }

    if (issueType === 'missingCover') {
      return '当前资源缺少封面，无法在封面墙与最近添加中正常展示。'
    }

    if (issueType === 'duplicateResource') {
      return '当前资源与同分类其他资源名称相同，建议核对是否重复导入、重名版本或需合并整理。'
    }

    const anchorTime = row.lastAccessTime ?? row.createTime
    const elapsedDays = anchorTime
      ? Math.max(0, Math.floor((Date.now() - anchorTime.getTime()) / (24 * 60 * 60 * 1000)))
      : thresholdDays
    return `当前资源已超过 ${thresholdDays} 天未访问，约 ${elapsedDays} 天未使用，建议判断是否归档或移出主视图。`
  }

  private static buildGovernanceIssueActions(issueType: GovernanceIssueType, ignored: boolean, archiveEnabled = false) {
    const restoreActions = ignored
      ? [{ label: '恢复待处理', tone: 'primary' as const }]
      : [{ label: '忽略', tone: 'default' as const }]

    if (issueType === 'brokenPath') {
      return [
        { label: '查看详情', tone: 'default' as const },
        { label: '重新扫描', tone: 'primary' as const },
        { label: '重定位资源', tone: 'warning' as const },
        { label: '移除资源', tone: 'error' as const },
        { label: '移除并删除本地资源', tone: 'error' as const },
        ...restoreActions
      ]
    }

    if (issueType === 'missingCover') {
      return [
        { label: '选择封面', tone: 'primary' as const },
        { label: '查看详情', tone: 'default' as const },
        { label: '移除资源', tone: 'error' as const },
        { label: '移除并删除本地资源', tone: 'error' as const },
        ...restoreActions
      ]
    }

    if (issueType === 'duplicateResource') {
      return [
        { label: '查看详情', tone: 'default' as const },
        { label: '移除资源', tone: 'error' as const },
        ...restoreActions
      ]
    }

    return [
      { label: '查看详情', tone: 'default' as const },
      ...(archiveEnabled ? [{ label: '归档', tone: 'primary' as const }] : []),
      { label: '移除资源', tone: 'error' as const },
      { label: '移除并删除本地资源', tone: 'error' as const },
      ...restoreActions
    ]
  }

  private static getGovernanceIssueCoverKind(issueType: GovernanceIssueType, ignored: boolean) {
    if (ignored) return 'ignored'
    if (issueType === 'brokenPath') return 'broken'
    if (issueType === 'missingCover') return 'missing'
    if (issueType === 'duplicateResource') return 'duplicate'
    return 'idle'
  }

  private static shouldSkipGovernanceBrokenPathCheck(row: GovernanceBaseResourceRow) {
    if (Boolean(row.isWebsiteResource)) {
      return true
    }

    const resourcePathType = String(row.categoryExtra?.resourcePathType ?? '').trim().toLowerCase()
    return resourcePathType === 'url'
  }

  private static async resolveGovernanceBrokenPathState(row: GovernanceBaseResourceRow): Promise<{
    checked: boolean
    missing: boolean
    subtype: BrokenPathSubtypeKey | null
  }> {
    if (this.shouldSkipGovernanceBrokenPathCheck(row)) {
      return {
        checked: false,
        missing: false,
        subtype: null
      }
    }

    const normalizedBasePath = String(row.basePath ?? '').trim()
    const normalizedFileName = String(row.fileName ?? '').trim()

    if (!normalizedBasePath) {
      return {
        checked: true,
        missing: true,
        subtype: 'directoryMissing'
      }
    }

    try {
      const basePathExists = await fs.pathExists(normalizedBasePath)
      if (!basePathExists) {
        return {
          checked: true,
          missing: true,
          subtype: 'directoryMissing'
        }
      }

      if (!normalizedFileName) {
        return {
          checked: true,
          missing: false,
          subtype: null
        }
      }

      const launchPath = path.join(normalizedBasePath, normalizedFileName)
      const launchFileExists = await fs.pathExists(launchPath)
      return {
        checked: true,
        missing: !launchFileExists,
        subtype: launchFileExists ? null : 'launchFileMissing'
      }
    } catch {
      return {
        checked: true,
        missing: true,
        subtype: normalizedFileName ? 'launchFileMissing' : 'directoryMissing'
      }
    }
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

  static async transaction<T>(callback: (tx: DbTransaction) => Promise<T>) {
    return db.transaction(callback)
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
    await Promise.all([
      this.ensureCategoryPillColorColumn(),
      this.ensureCategoryArchivePolicyExtra()
    ])

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
    await Promise.all([
      this.ensureCategoryPillColorColumn(),
      this.ensureCategoryArchivePolicyExtra()
    ])

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
    await Promise.all([
      this.ensureCategoryPillColorColumn(),
      this.ensureCategoryArchivePolicyExtra()
    ])

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
    await this.ensureMediaSubSchema()

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
      eq(resource.missingStatus, false),
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
      missingStatus: resource.missingStatus,
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

    const normalizedLimit = Math.max(1, Math.min(12, Math.floor(Number(limit) || 12)))

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
        missingStatus: resource.missingStatus,
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

  static async getHomeCoverWallData(query: number | { filter?: string; limit?: number; offset?: number; keyword?: string; categoryId?: string } = 15) {
    await this.ensureCategoryPillColorColumn()
    await this.ensureResourceSearchTextColumn()

    const filter = typeof query === 'object'
      ? String(query?.filter ?? 'all')
      : 'all'
    const normalizedLimit = Math.max(1, Math.min(180, Math.floor(typeof query === 'object' ? Number(query?.limit) : Number(query)) || 60))
    const normalizedOffset = Math.max(0, Math.floor(typeof query === 'object' ? Number(query?.offset) : 0) || 0)
    const keyword = typeof query === 'object' ? String(query?.keyword ?? '').trim().toLowerCase() : ''
    const categoryId = typeof query === 'object' ? String(query?.categoryId ?? '').trim() : ''
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
    const sharedWhereBase = and(
      eq(resource.isDeleted, false),
      eq(category.isDeleted, false)
    )
    const sharedWhere = and(
      sharedWhereBase,
      categoryId ? eq(resource.categoryId, categoryId) : undefined
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

    const categoryCountWhere = filter === 'recentRun'
      ? mergeWhere(
        and(
          sharedWhereBase,
          eq(resourceLog.isDeleted, false),
          sql`${resourceLog.startTime} >= strftime('%s', 'now', '-30 days')`
        ),
        keywordWhere
      )
      : filter === 'recentAdd'
        ? mergeWhere(
          and(
            sharedWhereBase,
            sql`${resource.createTime} >= strftime('%s', 'now', '-30 days')`
          ),
          keywordWhere
        )
        : filter === 'favorite'
          ? mergeWhere(and(sharedWhereBase, eq(resource.ifFavorite, true)), keywordWhere)
          : filter === 'coverOnly'
            ? mergeWhere(and(
              sharedWhereBase,
              sql`${resource.coverPath} is not null`,
              sql`trim(${resource.coverPath}) <> ''`
            ), keywordWhere)
            : mergeWhere(sharedWhereBase, keywordWhere)

    const [allCount, recentRunCount, recentAddCount, favoriteCount, coverOnlyCount, categoryCounts] = await Promise.all([
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
        .where(mergeWhere(coverOnlyWhere, keywordWhere)),
      filter === 'recentRun'
        ? db.select({
          categoryId: category.id,
          categoryName: category.name,
          categoryEmoji: category.emoji,
          categoryPillColor: category.pillColor,
          total: count(sql`distinct ${resource.id}`)
        })
          .from(resourceLog)
          .innerJoin(resource, eq(resourceLog.resourceId, resource.id))
          .innerJoin(category, eq(resource.categoryId, category.id))
          .where(categoryCountWhere)
          .groupBy(category.id)
          .orderBy(desc(count(sql`distinct ${resource.id}`)), asc(category.name))
        : db.select({
          categoryId: category.id,
          categoryName: category.name,
          categoryEmoji: category.emoji,
          categoryPillColor: category.pillColor,
          total: count(resource.id)
        })
          .from(resource)
          .innerJoin(category, eq(resource.categoryId, category.id))
          .where(categoryCountWhere)
          .groupBy(category.id)
          .orderBy(desc(count(resource.id)), asc(category.name))
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
      categoryCounts: Array.isArray(categoryCounts) ? categoryCounts : [],
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

  static async getApiStatusResourceSummary() {
    const [totalResult, typeRows] = await Promise.all([
      db
        .select({ total: count(resource.id) })
        .from(resource)
        .innerJoin(category, eq(resource.categoryId, category.id))
        .where(and(
          eq(resource.isDeleted, false),
          eq(category.isDeleted, false)
        )),
      db
        .select({
          id: category.id,
          name: category.name,
          emoji: category.emoji,
          pillColor: category.pillColor,
          sort: category.sort,
          count: count(resource.id)
        })
        .from(category)
        .leftJoin(resource, and(
          eq(resource.categoryId, category.id),
          eq(resource.isDeleted, false)
        ))
        .where(eq(category.isDeleted, false))
        .groupBy(category.id, category.name, category.emoji, category.pillColor, category.sort)
        .orderBy(asc(category.sort), asc(category.name))
    ])

    return {
      total: Number(totalResult[0]?.total ?? 0),
      types: typeRows.map((row) => ({
        id: row.id,
        name: row.name,
        emoji: row.emoji ?? '',
        pillColor: row.pillColor ?? '',
        sort: Number(row.sort ?? 0),
        count: Number(row.count ?? 0)
      }))
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
        .leftJoin(websiteMeta, eq(websiteMeta.resourceId, resource.id))
        .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
        .where(and(
          eq(resource.isDeleted, false),
          sql`${websiteMeta.resourceId} is null`,
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
        ? and(eq(resource.isDeleted, false), sql`${websiteMeta.resourceId} is null`, lowerBoundCondition, upperBoundCondition)
        : and(eq(resource.isDeleted, false), sql`${websiteMeta.resourceId} is null`, lowerBoundCondition)

      const rows = await db
        .select({ total: count(resource.id) })
        .from(resource)
        .leftJoin(websiteMeta, eq(websiteMeta.resourceId, resource.id))
        .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
        .where(whereClause)

      return {
        label: bucket.label,
        value: Number(rows[0]?.total ?? 0)
      }
    }))

    return results
  }

  static async getGovernanceIssueWorkbench(query: GovernanceIssueQuery = {}) {
    await Promise.all([
      this.ensureCategoryPillColorColumn(),
      this.ensureResourceIssueIgnoreSchema(),
      this.ensureArchivePackageSchema(),
      this.ensureCategoryArchivePolicyExtra(),
    ])

    const longUnvisitedSetting = await this.getSetting(Settings.DASHBOARD_LONG_UNVISITED_DAYS)
    const thresholdDays = Math.max(
      MIN_LONG_UNVISITED_DAYS,
      Math.min(
        MAX_LONG_UNVISITED_DAYS,
        Math.floor(Number(longUnvisitedSetting?.value ?? Settings.DASHBOARD_LONG_UNVISITED_DAYS.default) || MIN_LONG_UNVISITED_DAYS)
      )
    )

    const formatDateTime = (value: Date | null) => {
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        return '暂无'
      }
      const year = value.getFullYear()
      const month = String(value.getMonth() + 1).padStart(2, '0')
      const day = String(value.getDate()).padStart(2, '0')
      const hour = String(value.getHours()).padStart(2, '0')
      const minute = String(value.getMinutes()).padStart(2, '0')
      return `${year}-${month}-${day} ${hour}:${minute}`
    }

    const formatDate = (value: Date | null) => {
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        return '暂无'
      }
      const year = value.getFullYear()
      const month = String(value.getMonth() + 1).padStart(2, '0')
      const day = String(value.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    const isLongUnvisited = (lastAccessTime: Date | null, createdAt: Date | null) => {
      const anchor = lastAccessTime ?? createdAt
      if (!(anchor instanceof Date) || Number.isNaN(anchor.getTime())) {
        return false
      }

      const elapsedMs = Date.now() - anchor.getTime()
      return elapsedMs >= thresholdDays * 24 * 60 * 60 * 1000
    }

    const resolveLongUnvisitedBucket = (lastAccessTime: Date | null, createdAt: Date | null): LongUnvisitedBucketKey | null => {
      const anchor = lastAccessTime ?? createdAt
      if (!(anchor instanceof Date) || Number.isNaN(anchor.getTime())) {
        return null
      }

      const elapsedDays = (Date.now() - anchor.getTime()) / (24 * 60 * 60 * 1000)
      if (elapsedDays < thresholdDays) {
        return null
      }
      if (elapsedDays < 90) {
        return 'over1Month'
      }
      if (elapsedDays < 180) {
        return 'threeToSixMonths'
      }
      if (elapsedDays < 365) {
        return 'sixToTwelveMonths'
      }
      return 'overOneYear'
    }

    const [
      baseRows,
      ignoredRows,
      totalTagRows,
      totalTypeRows,
      totalCategoryRows,
      archiveSummaryRows,
    ] = await Promise.all([
      db
        .select({
          id: resource.id,
          title: resource.title,
          categoryId: resource.categoryId,
          categoryName: category.name,
          categoryEmoji: category.emoji,
          categoryPillColor: category.pillColor,
          categoryExtra: dictData.extra,
          coverPath: resource.coverPath,
          description: resource.description,
          basePath: resource.basePath,
          fileName: resource.fileName,
          favorite: resource.ifFavorite,
          rating: resource.rating,
          missingStatus: resource.missingStatus,
          createTime: resource.createTime,
          lastAccessTime: resourceStat.lastAccessTime,
          isWebsiteResource: sql<boolean>`case when ${websiteMeta.resourceId} is not null then 1 else 0 end`,
          tagsText: sql<string>`(
            select group_concat(${tag.name}, '||')
            from ${tagResource}
            inner join ${tag} on ${tag.id} = ${tagResource.tagId}
            where ${tagResource.resourceId} = ${resource.id}
              and coalesce(${tag.isDeleted}, 0) = 0
          )`
        })
        .from(resource)
        .innerJoin(category, eq(resource.categoryId, category.id))
        .leftJoin(dictData, eq(category.referenceId, dictData.id))
        .leftJoin(websiteMeta, eq(websiteMeta.resourceId, resource.id))
        .leftJoin(resourceStat, eq(resourceStat.resourceId, resource.id))
        .where(and(
          eq(resource.isDeleted, false),
          eq(category.isDeleted, false)
        )),
      db
        .select({
          resourceId: resourceIssueIgnore.resourceId,
          issueType: resourceIssueIgnore.issueType,
          ignoredAt: resourceIssueIgnore.ignoredAt
        })
        .from(resourceIssueIgnore),
      db
        .select({ total: count(tag.id) })
        .from(tag)
        .where(eq(tag.isDeleted, false)),
      db
        .select({ total: count(resourceType.id) })
        .from(resourceType)
        .where(eq(resourceType.isDeleted, false)),
      db
        .select({ total: count(category.id) })
        .from(category)
        .where(eq(category.isDeleted, false)),
      db
        .select({
          total: count(archivePackage.id),
          totalSize: sql<number>`coalesce(sum(${archivePackage.archiveSize}), 0)`
        })
        .from(archivePackage)
        .where(eq(archivePackage.isDeleted, false))
    ])

    const ignoredSet = new Set(
      ignoredRows
        .map((item) => {
          const resourceId = String(item.resourceId ?? '').trim()
          const issueType = String(item.issueType ?? '').trim()
          return resourceId && issueType ? `${resourceId}:${issueType}` : ''
        })
        .filter(Boolean)
    )

    const duplicateNameMap = baseRows
      .map((row) => ({
        id: String(row.id ?? '').trim(),
        title: String(row.title ?? '').trim(),
        key: `${String(row.categoryId ?? '').trim()}::${String(row.title ?? '').trim().toLowerCase()}`
      }))
      .filter((item) => item.id && item.title && item.key !== '::')
      .reduce((map, item) => {
        const current = map.get(item.key) ?? []
        current.push(item.id)
        map.set(item.key, current)
        return map
      }, new Map<string, string[]>())

    const duplicateNameSet = new Set(
      Array.from(duplicateNameMap.values())
        .filter((ids) => ids.length > 1)
        .flat()
    )

    const baseRowsWithBrokenState = await Promise.all(baseRows.map(async (row) => ({
      row,
      brokenPathState: await this.resolveGovernanceBrokenPathState(row)
    })))

    const missingStatusChanges = baseRowsWithBrokenState
      .filter(({ row, brokenPathState }) => brokenPathState.checked && Boolean(row.missingStatus) !== brokenPathState.missing)
      .map(({ row, brokenPathState }) => ({
        resourceId: String(row.id ?? '').trim(),
        missing: brokenPathState.missing
      }))

    if (missingStatusChanges.length) {
      const missingTrueIds = missingStatusChanges.filter((item) => item.missing).map((item) => item.resourceId)
      const missingFalseIds = missingStatusChanges.filter((item) => !item.missing).map((item) => item.resourceId)

      if (missingTrueIds.length) {
        await db
          .update(resource)
          .set({ missingStatus: true })
          .where(inArray(resource.id, missingTrueIds))
      }

      if (missingFalseIds.length) {
        await db
          .update(resource)
          .set({ missingStatus: false })
          .where(inArray(resource.id, missingFalseIds))
      }
    }

    const issueEntries = (await Promise.all(baseRowsWithBrokenState.map(async ({ row, brokenPathState }) => {
      const tags = String(row.tagsText ?? '')
        .split('||')
        .map((item) => item.trim())
        .filter(Boolean)

      const activeIssueTypes: GovernanceIssueType[] = []
      if (brokenPathState.missing) {
        activeIssueTypes.push('brokenPath')
      }
      if (!String(row.coverPath ?? '').trim()) {
        activeIssueTypes.push('missingCover')
      }
      if (!Boolean(row.isWebsiteResource) && isLongUnvisited(row.lastAccessTime, row.createTime)) {
        activeIssueTypes.push('longUnvisited')
      }
      if (duplicateNameSet.has(String(row.id ?? '').trim())) {
        activeIssueTypes.push('duplicateResource')
      }

      return await Promise.all(activeIssueTypes.map(async (issueType) => {
        const ignored = ignoredSet.has(`${row.id}:${issueType}`)
        const numericRating = Number(row.rating ?? -1)
        const normalizedRating = Number.isFinite(numericRating) && numericRating >= 0 ? numericRating : 0
        const issueSubType = issueType === 'brokenPath'
          ? (brokenPathState.subtype ?? 'directoryMissing')
          : null
        const longUnvisitedBucket = issueType === 'longUnvisited'
          ? resolveLongUnvisitedBucket(row.lastAccessTime, row.createTime)
          : null
        const issueSubTypeLabel = issueSubType === 'directoryMissing'
          ? '目录失效'
          : issueSubType === 'launchFileMissing'
            ? '启动文件丢失'
            : ''
        const archiveEnabled = Boolean(row.categoryExtra?.archiveEnabled)

        return {
          id: `${row.id}:${issueType}`,
          resourceId: String(row.id ?? '').trim(),
          title: String(row.title ?? '').trim() || '未命名资源',
          category: String(row.categoryName ?? '').trim() || '未分类',
          categoryId: String(row.categoryId ?? '').trim(),
          categoryEmoji: String(row.categoryEmoji ?? '').trim(),
          categoryColor: String(row.categoryPillColor ?? '').trim() || '#737373',
          coverPath: String(row.coverPath ?? '').trim(),
          tags,
          issueType,
          issueSubType,
          longUnvisitedBucket,
          issueSubTypeLabel,
          issueTypeLabel: issueType === 'brokenPath'
            ? '路径失效'
            : issueType === 'missingCover'
              ? '封面缺失'
              : issueType === 'duplicateResource'
                ? '疑似重复'
              : '沉睡资源',
          issueDetail: this.buildGovernanceIssueDetail(issueType, row, thresholdDays),
          currentRecordLabel: issueType === 'brokenPath'
            ? (issueSubType === 'launchFileMissing' ? '当前启动路径' : '当前记录目录')
            : '',
          currentRecordPath: issueType === 'brokenPath'
            ? (issueSubType === 'launchFileMissing'
              ? path.join(String(row.basePath ?? '').trim(), String(row.fileName ?? '').trim())
              : String(row.basePath ?? '').trim())
            : '',
          resourcePath: String(row.fileName ?? '').trim()
            ? path.join(String(row.basePath ?? '').trim(), String(row.fileName ?? '').trim())
            : String(row.basePath ?? '').trim(),
          currentRecordDirectoryPath: issueType === 'brokenPath' ? String(row.basePath ?? '').trim() : '',
          recentAccess: formatDateTime(row.lastAccessTime),
          createdAt: formatDate(row.createTime),
          status: ignored ? '已忽略' : '待处理',
          coverKind: this.getGovernanceIssueCoverKind(issueType, ignored),
          coverLabel: ignored
            ? '已忽略'
            : issueType === 'brokenPath'
              ? '路径失效'
              : issueType === 'missingCover'
              ? '缺封面'
                : issueType === 'duplicateResource'
                  ? '重复'
                : '沉睡资源',
          rating: normalizedRating.toFixed(1),
          ratingValue: normalizedRating,
          favorite: Boolean(row.favorite),
          lastAccessTimestamp: row.lastAccessTime?.getTime?.() ?? 0,
          createdTimestamp: row.createTime?.getTime?.() ?? 0,
          actions: this.buildGovernanceIssueActions(issueType, ignored, archiveEnabled)
        }
      }))
    }))).flat()

    const activeIssueEntries = issueEntries.filter((item) => item.status !== '已忽略')
    const ignoredIssueEntries = issueEntries.filter((item) => item.status === '已忽略')

    const tabCounts = {
      all: activeIssueEntries.length,
      brokenPath: activeIssueEntries.filter((item) => item.issueType === 'brokenPath').length,
      missingCover: activeIssueEntries.filter((item) => item.issueType === 'missingCover').length,
      longUnvisited: activeIssueEntries.filter((item) => item.issueType === 'longUnvisited').length,
      duplicateResource: activeIssueEntries.filter((item) => item.issueType === 'duplicateResource').length,
      ignored: ignoredIssueEntries.length
    }

    const brokenPathSubCounts = {
      all: activeIssueEntries.filter((item) => item.issueType === 'brokenPath').length,
      directoryMissing: activeIssueEntries.filter((item) => item.issueType === 'brokenPath' && item.issueSubType === 'directoryMissing').length,
      launchFileMissing: activeIssueEntries.filter((item) => item.issueType === 'brokenPath' && item.issueSubType === 'launchFileMissing').length
    }
    const longUnvisitedSubCounts = {
      all: activeIssueEntries.filter((item) => item.issueType === 'longUnvisited').length,
      over1Month: activeIssueEntries.filter((item) => item.issueType === 'longUnvisited' && item.longUnvisitedBucket === 'over1Month').length,
      threeToSixMonths: activeIssueEntries.filter((item) => item.issueType === 'longUnvisited' && item.longUnvisitedBucket === 'threeToSixMonths').length,
      sixToTwelveMonths: activeIssueEntries.filter((item) => item.issueType === 'longUnvisited' && item.longUnvisitedBucket === 'sixToTwelveMonths').length,
      overOneYear: activeIssueEntries.filter((item) => item.issueType === 'longUnvisited' && item.longUnvisitedBucket === 'overOneYear').length
    }

    const normalizedIssueType = query.issueType ?? 'all'
    const normalizedBrokenPathSubtype = query.brokenPathSubtype ?? 'all'
    const normalizedLongUnvisitedBucket = query.longUnvisitedBucket ?? 'all'
    const filteredItems = issueEntries
      .filter((item) => {
        const keyword = String(query.keyword ?? '').trim().toLowerCase()
        const normalizedCategory = String(query.category ?? 'all').trim()
        const normalizedTag = String(query.tag ?? 'all').trim()
        const normalizedStatus = String(query.status ?? 'all').trim()
        const normalizedRating = String(query.rating ?? 'all').trim()

        const matchesTab = normalizedIssueType === 'all'
          ? item.status !== '已忽略'
          : normalizedIssueType === 'ignored'
            ? item.status === '已忽略'
            : item.issueType === normalizedIssueType && item.status !== '已忽略'
        const matchesBrokenPathSubtype = normalizedIssueType !== 'brokenPath'
          || normalizedBrokenPathSubtype === 'all'
          || item.issueSubType === normalizedBrokenPathSubtype
        const matchesLongUnvisitedBucket = normalizedIssueType !== 'longUnvisited'
          || normalizedLongUnvisitedBucket === 'all'
          || item.longUnvisitedBucket === normalizedLongUnvisitedBucket

        const matchesKeyword = !keyword || [
          item.title,
          item.category,
          item.issueTypeLabel,
          item.issueDetail,
          ...item.tags
        ].join(' ').toLowerCase().includes(keyword)

        const matchesCategory = normalizedCategory === 'all' || item.category === normalizedCategory
        const matchesTag = normalizedTag === 'all' || item.tags.includes(normalizedTag)
        const matchesStatus = normalizedStatus === 'all' || item.status === normalizedStatus
        const matchesRating = normalizedRating === 'all'
          || (normalizedRating === '4+' && item.ratingValue >= 4)
          || (normalizedRating === '3+' && item.ratingValue >= 3)
          || (normalizedRating === '0-3' && item.ratingValue < 3)
        const matchesFavorite = !query.onlyFavorite || item.favorite
        const matchesRecent = !query.onlyRecent || item.issueType === 'longUnvisited'

        return matchesTab
          && matchesBrokenPathSubtype
          && matchesLongUnvisitedBucket
          && matchesKeyword
          && matchesCategory
          && matchesTag
          && matchesStatus
          && matchesRating
          && matchesFavorite
          && matchesRecent
      })
      .sort((left, right) => {
        if (query.sortBy === 'recent') {
          return right.lastAccessTimestamp - left.lastAccessTimestamp
        }

        if (query.sortBy === 'created') {
          return right.createdTimestamp - left.createdTimestamp
        }

        if (left.status !== right.status) {
          return left.status === '待处理' ? -1 : 1
        }

        if (left.favorite !== right.favorite) {
          return left.favorite ? -1 : 1
        }

        if (left.ratingValue !== right.ratingValue) {
          return right.ratingValue - left.ratingValue
        }

        return right.createdTimestamp - left.createdTimestamp
      })

    const categoryOrderRows = await db
      .select({
        name: category.name,
        sort: category.sort
      })
      .from(category)
      .where(eq(category.isDeleted, false))
      .orderBy(asc(category.sort), asc(category.name))

    const visibleCategoryNames = new Set(
      activeIssueEntries
        .map((item) => String(item.category ?? '').trim())
        .filter(Boolean)
    )
    const orderedCategoryNames = categoryOrderRows
      .map((item) => String(item.name ?? '').trim())
      .filter((name) => name && visibleCategoryNames.has(name))
    const missingCategoryNames = Array.from(visibleCategoryNames)
      .filter((name) => !orderedCategoryNames.includes(name))
      .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
    const categoryOptions = [...orderedCategoryNames, ...missingCategoryNames]
      .map((name) => ({ label: name, value: name }))

    const tagOptions = Array.from(new Set(activeIssueEntries.flatMap((item) => item.tags)))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
      .map((name) => ({ label: name, value: name }))

    return {
      summary: {
        allIssueCount: tabCounts.all,
        brokenPathCount: tabCounts.brokenPath,
        missingCoverCount: tabCounts.missingCover,
        longUnvisitedCount: tabCounts.longUnvisited,
        duplicateResourceCount: tabCounts.duplicateResource,
        ignoredCount: tabCounts.ignored,
        totalTagCount: Number(totalTagRows[0]?.total ?? 0),
        totalTypeCount: Number(totalTypeRows[0]?.total ?? 0),
        totalCategoryCount: Number(totalCategoryRows[0]?.total ?? 0),
        archiveCandidateCount: tabCounts.longUnvisited,
        archivePackageCount: Number(archiveSummaryRows[0]?.total ?? 0),
        archiveStorageSizeBytes: Number(archiveSummaryRows[0]?.totalSize ?? 0)
      },
      tabs: [
        { key: 'all', label: '全部', count: tabCounts.all },
        { key: 'brokenPath', label: '路径失效', count: tabCounts.brokenPath },
        { key: 'missingCover', label: '封面缺失', count: tabCounts.missingCover },
        { key: 'longUnvisited', label: '沉睡资源', count: tabCounts.longUnvisited },
        { key: 'duplicateResource', label: '疑似重复', count: tabCounts.duplicateResource },
        { key: 'ignored', label: '已忽略问题', count: tabCounts.ignored }
      ],
      brokenPathSubTabs: [
        { key: 'all', label: '全部', count: brokenPathSubCounts.all },
        { key: 'directoryMissing', label: '目录失效', count: brokenPathSubCounts.directoryMissing },
        { key: 'launchFileMissing', label: '启动文件丢失', count: brokenPathSubCounts.launchFileMissing }
      ],
      longUnvisitedSubTabs: [
        { key: 'all', label: '全部', count: longUnvisitedSubCounts.all },
        { key: 'over1Month', label: '超 1 个月', count: longUnvisitedSubCounts.over1Month },
        { key: 'threeToSixMonths', label: '3 - 6 个月', count: longUnvisitedSubCounts.threeToSixMonths },
        { key: 'sixToTwelveMonths', label: '6 - 12 个月', count: longUnvisitedSubCounts.sixToTwelveMonths },
        { key: 'overOneYear', label: '1 年以上', count: longUnvisitedSubCounts.overOneYear }
      ],
      filters: {
        categories: [{ label: '全部分类', value: 'all' }, ...categoryOptions],
        tags: [{ label: '全部标签', value: 'all' }, ...tagOptions]
      },
      items: filteredItems
    }
  }

  static async getGovernanceTagWorkbench() {
    await Promise.all([
      this.ensureCategoryPillColorColumn(),
      this.ensureCategoryArchivePolicyExtra()
    ])

    const tagResourceCount = count(resource.id)
    const typeResourceCount = count(resource.id)

    const categoryRows = await db
      .select({
        id: category.id,
        name: category.name,
        emoji: category.emoji,
        pillColor: category.pillColor,
        sort: category.sort
      })
      .from(category)
      .where(eq(category.isDeleted, false))
      .orderBy(asc(category.sort), asc(category.name))

    const tagRows = await db
      .select({
        id: tag.id,
        name: tag.name,
        categoryId: tag.categoryId,
        categoryName: category.name,
        categoryEmoji: category.emoji,
        categoryColor: category.pillColor,
        resourceCount: tagResourceCount
      })
      .from(tag)
      .innerJoin(category, eq(tag.categoryId, category.id))
      .leftJoin(tagResource, eq(tagResource.tagId, tag.id))
      .leftJoin(resource, and(
        eq(resource.id, tagResource.resourceId),
        eq(resource.isDeleted, false)
      ))
      .where(and(
        eq(tag.isDeleted, false),
        eq(category.isDeleted, false)
      ))
      .groupBy(tag.id, tag.name, tag.categoryId, category.name, category.emoji, category.pillColor, category.sort)
      .orderBy(asc(category.sort), asc(tag.name))

    const typeRows = await db
      .select({
        id: resourceType.id,
        name: resourceType.name,
        categoryId: resourceType.categoryId,
        categoryName: category.name,
        categoryEmoji: category.emoji,
        categoryColor: category.pillColor,
        resourceCount: typeResourceCount
      })
      .from(resourceType)
      .innerJoin(category, eq(resourceType.categoryId, category.id))
      .leftJoin(typeResource, eq(typeResource.typeId, resourceType.id))
      .leftJoin(resource, and(
        eq(resource.id, typeResource.resourceId),
        eq(resource.isDeleted, false)
      ))
      .where(and(
        eq(resourceType.isDeleted, false),
        eq(category.isDeleted, false)
      ))
      .groupBy(resourceType.id, resourceType.name, resourceType.categoryId, category.name, category.emoji, category.pillColor, category.sort)
      .orderBy(asc(category.sort), asc(resourceType.name))

    const categories = categoryRows.map((item) => ({
      id: item.id,
      name: item.name,
      emoji: item.emoji,
      categoryColor: item.pillColor,
      sort: Number(item.sort ?? 0)
    }))

    const tags = tagRows.map((item) => ({
      id: item.id,
      name: item.name,
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      categoryEmoji: item.categoryEmoji,
      categoryColor: item.categoryColor,
      resourceCount: Number(item.resourceCount ?? 0)
    }))

    const types = typeRows.map((item) => ({
      id: item.id,
      name: item.name,
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      categoryEmoji: item.categoryEmoji,
      categoryColor: item.categoryColor,
      resourceCount: Number(item.resourceCount ?? 0)
    }))

    return {
      summary: {
        totalTagCount: tags.length,
        totalTypeCount: types.length,
        unusedTagCount: tags.filter((item) => item.resourceCount <= 0).length,
        unusedTypeCount: types.filter((item) => item.resourceCount <= 0).length
      },
      filters: {
        categories: [
          { label: '全部分类', value: 'all' },
          ...categories.map((item) => ({ label: item.name, value: item.id }))
        ]
      },
      tags,
      types
    }
  }

  static async renameGovernanceTagEntity(kind: 'tag' | 'type', id: string, name: string) {
    const normalizedKind = kind === 'type' ? 'type' : 'tag'
    const normalizedId = String(id ?? '').trim()
    const normalizedName = String(name ?? '').trim()

    if (!normalizedId || !normalizedName) {
      return {
        type: 'warning',
        message: '名称不能为空'
      }
    }

    const targetTable = normalizedKind === 'tag' ? tag : resourceType
    const current = await db
      .select({
        id: targetTable.id,
        categoryId: targetTable.categoryId
      })
      .from(targetTable)
      .where(and(
        eq(targetTable.id, normalizedId),
        eq(targetTable.isDeleted, false)
      ))
      .limit(1)

    if (!current.length) {
      return {
        type: 'warning',
        message: normalizedKind === 'tag' ? '标签不存在或已删除' : '分类不存在或已删除'
      }
    }

    const duplicated = await db
      .select({ id: targetTable.id })
      .from(targetTable)
      .where(and(
        eq(targetTable.categoryId, current[0].categoryId),
        eq(targetTable.name, normalizedName),
        eq(targetTable.isDeleted, false),
        not(eq(targetTable.id, normalizedId))
      ))
      .limit(1)

    if (duplicated.length) {
      return {
        type: 'warning',
        message: normalizedKind === 'tag' ? '同分类下已存在同名标签' : '同分类下已存在同名分类'
      }
    }

    await db
      .update(targetTable)
      .set({ name: normalizedName })
      .where(eq(targetTable.id, normalizedId))

    return {
      type: 'success',
      message: '重命名成功'
    }
  }

  static async deleteGovernanceTagEntity(kind: 'tag' | 'type', id: string) {
    const normalizedKind = kind === 'type' ? 'type' : 'tag'
    const normalizedId = String(id ?? '').trim()

    if (!normalizedId) {
      return {
        type: 'warning',
        message: '请选择要删除的项目'
      }
    }

    await db.transaction(async (tx) => {
      if (normalizedKind === 'tag') {
        await tx.delete(tagResource).where(eq(tagResource.tagId, normalizedId))
        await tx.update(tag).set({ isDeleted: true }).where(eq(tag.id, normalizedId))
        return
      }

      await tx.delete(typeResource).where(eq(typeResource.typeId, normalizedId))
      await tx.update(resourceType).set({ isDeleted: true }).where(eq(resourceType.id, normalizedId))
    })

    return {
      type: 'success',
      message: normalizedKind === 'tag' ? '标签已删除' : '分类已删除'
    }
  }

  static async deleteGovernanceTagEntities(kind: 'tag' | 'type', ids: string[]) {
    const normalizedKind = kind === 'type' ? 'type' : 'tag'
    const normalizedIds = Array.from(new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => String(id ?? '').trim())
        .filter(Boolean)
    ))

    if (!normalizedIds.length) {
      return {
        type: 'warning',
        message: '请选择要删除的项目'
      }
    }

    await db.transaction(async (tx) => {
      if (normalizedKind === 'tag') {
        await tx.delete(tagResource).where(inArray(tagResource.tagId, normalizedIds))
        await tx.update(tag).set({ isDeleted: true }).where(inArray(tag.id, normalizedIds))
        return
      }

      await tx.delete(typeResource).where(inArray(typeResource.typeId, normalizedIds))
      await tx.update(resourceType).set({ isDeleted: true }).where(inArray(resourceType.id, normalizedIds))
    })

    return {
      type: 'success',
      message: `已删除 ${normalizedIds.length} 个${normalizedKind === 'tag' ? '标签' : '分类'}`
    }
  }

  static async setGovernanceIssueIgnored(resourceId: string, issueType: GovernanceIssueType, ignored: boolean, tx?: DbExecutor) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return
    }

    await this.ensureResourceIssueIgnoreSchema()
    const executor = tx ?? db

    if (ignored) {
      await executor
        .insert(resourceIssueIgnore)
        .values({
          resourceId: normalizedResourceId,
          issueType,
          ignoredAt: new Date()
        })
        .onConflictDoUpdate({
          target: [resourceIssueIgnore.resourceId, resourceIssueIgnore.issueType],
          set: { ignoredAt: new Date() }
        })
      return
    }

    await executor
      .delete(resourceIssueIgnore)
      .where(and(
        eq(resourceIssueIgnore.resourceId, normalizedResourceId),
        eq(resourceIssueIgnore.issueType, issueType)
      ))
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
        missingStatus: resource.missingStatus,
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

  static async getResourceArchiveSourceResourceById(resourceId: string) {
    await this.ensureResourceTopAndHomePinSchema()

    return await db.query.resource.findFirst({
      where: eq(resource.id, resourceId)
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

  static async getResourceArchiveByResourceId(resourceId: string, tx?: DbExecutor) {
    await this.ensureArchivePackageSchema()
    const executor = tx ?? db
    const rows = await executor
      .select({
        id: archivePackage.id,
        archivePath: archivePackage.archivePath,
        archiveFormat: archivePackage.archiveFormat,
        status: archivePackage.status,
        archivedAt: archivePackage.archivedAt,
        packageTitle: archivePackage.packageTitle,
        resourceCount: archivePackage.resourceCount,
        sourceTotalSize: archivePackage.sourceTotalSize,
        archiveSize: archivePackage.archiveSize,
      })
      .from(archivePackageItem)
      .innerJoin(archivePackage, eq(archivePackageItem.packageId, archivePackage.id))
      .where(and(
        eq(archivePackageItem.resourceId, resourceId),
        eq(archivePackageItem.isDeleted, false),
        eq(archivePackage.isDeleted, false)
      ))
      .orderBy(desc(archivePackage.archivedAt), desc(archivePackage.id))

    return rows[0] ?? null
  }

  static async getResourceArchiveById(archiveId: string, tx?: DbExecutor) {
    await this.ensureArchivePackageSchema()
    const executor = tx ?? db
    return await executor.query.archivePackage.findFirst({
      where: and(
        eq(archivePackage.id, archiveId),
        eq(archivePackage.isDeleted, false)
      )
    })
  }

  static async listResourceArchiveItemsByArchiveId(archiveId: string, tx?: DbExecutor) {
    await this.ensureArchivePackageSchema()
    const executor = tx ?? db
    return await executor
      .select()
      .from(archivePackageItem)
      .where(and(
        eq(archivePackageItem.packageId, archiveId),
        eq(archivePackageItem.isDeleted, false)
      ))
      .orderBy(asc(archivePackageItem.sortOrder), asc(archivePackageItem.id))
  }

  static async insertResourceArchive(params: {
    packageData: typeof archivePackage.$inferInsert
    itemDataList: Array<typeof archivePackageItem.$inferInsert>
  }, tx?: DbExecutor) {
    await this.ensureArchivePackageSchema()
    const executor = tx ?? db
    await executor.insert(archivePackage).values(params.packageData)
    if (params.itemDataList.length) {
      await executor.insert(archivePackageItem).values(params.itemDataList)
    }
  }

  static async restoreResourceArchive(archiveId: string, resourceIds: string[], tx?: DbExecutor) {
    await this.ensureArchivePackageSchema()
    const executor = tx ?? db
    const normalizedResourceIds = resourceIds.map((item) => String(item ?? '').trim()).filter(Boolean)
    if (normalizedResourceIds.length) {
      await executor
        .update(resource)
        .set({
          isDeleted: false,
          missingStatus: false
        })
        .where(inArray(resource.id, normalizedResourceIds))
    }
    await executor
      .update(archivePackageItem)
      .set({
        isDeleted: true
      })
      .where(eq(archivePackageItem.packageId, archiveId))
    await executor
      .update(archivePackage)
      .set({
        status: 'restored',
        isDeleted: true
      })
      .where(eq(archivePackage.id, archiveId))
  }

  static async logicalDeleteResourceArchive(archiveId: string, tx?: DbExecutor) {
    await this.ensureArchivePackageSchema()
    const executor = tx ?? db
    await executor
      .update(archivePackageItem)
      .set({
        isDeleted: true
      })
      .where(eq(archivePackageItem.packageId, archiveId))
    await executor
      .update(archivePackage)
      .set({
        status: 'deleted',
        isDeleted: true
      })
      .where(eq(archivePackage.id, archiveId))
  }

  static async listArchivedPackages() {
    await this.ensureArchivePackageSchema()

    const rows = await db
      .select({
        id: archivePackage.id,
        packageTitle: archivePackage.packageTitle,
        archivePath: archivePackage.archivePath,
        archiveFormat: archivePackage.archiveFormat,
        archiveLevel: archivePackage.archiveLevel,
        passwordEnabled: archivePackage.passwordEnabled,
        archivePassword: archivePackage.archivePassword,
        sourceTotalSize: archivePackage.sourceTotalSize,
        archiveSize: archivePackage.archiveSize,
        resourceCount: archivePackage.resourceCount,
        status: archivePackage.status,
        archivedAt: archivePackage.archivedAt,
        itemSourcePath: archivePackageItem.sourcePath,
        itemResourceId: archivePackageItem.resourceId,
        itemCoverPath: resource.coverPath,
        title: resource.title,
        categoryId: resource.categoryId,
        categoryName: category.name,
        categoryEmoji: category.emoji,
        categoryPillColor: category.pillColor,
      })
      .from(archivePackage)
      .innerJoin(archivePackageItem, and(
        eq(archivePackageItem.packageId, archivePackage.id),
        eq(archivePackageItem.isDeleted, false)
      ))
      .innerJoin(resource, eq(archivePackageItem.resourceId, resource.id))
      .leftJoin(category, eq(resource.categoryId, category.id))
      .where(eq(archivePackage.isDeleted, false))
      .orderBy(desc(archivePackage.archivedAt), desc(archivePackage.id), asc(archivePackageItem.sortOrder))

    const packageMap = new Map<string, {
      id: string
      resourceId: string
      archivePath: string
      archiveFormat: string
      archiveLevel: number | null
      passwordEnabled: boolean | null
      archivePassword: string | null
      sourcePath: string
      sourceSize: number | null
      archiveSize: number | null
      resourceCount: number
      status: string | null
      archivedAt: Date | null
      title: string
      categoryId: string
      categoryName: string
      categoryEmoji: string
      categoryColor: string
      items: Array<{
        resourceId: string
        title: string
        coverPath: string
        sourcePath: string
        categoryId: string
        categoryName: string
        categoryEmoji: string
        categoryColor: string
      }>
    }>()

    for (const row of rows) {
      const packageId = String(row.id ?? '').trim()
      if (!packageId) {
        continue
      }
      const itemRecord = {
        resourceId: String(row.itemResourceId ?? '').trim(),
        title: String(row.title ?? '').trim() || '未命名资源',
        coverPath: String(row.itemCoverPath ?? '').trim(),
        sourcePath: String(row.itemSourcePath ?? '').trim(),
        categoryId: String(row.categoryId ?? '').trim(),
        categoryName: String(row.categoryName ?? '').trim() || '未分类',
        categoryEmoji: String(row.categoryEmoji ?? '').trim(),
        categoryColor: String(row.categoryPillColor ?? '').trim() || '#737373',
      }

      const existingPackage = packageMap.get(packageId)
      if (existingPackage) {
        existingPackage.items.push(itemRecord)
        continue
      }

      packageMap.set(packageId, {
        id: packageId,
        resourceId: itemRecord.resourceId,
        archivePath: String(row.archivePath ?? '').trim(),
        archiveFormat: String(row.archiveFormat ?? '').trim(),
        archiveLevel: row.archiveLevel ?? null,
        passwordEnabled: row.passwordEnabled ?? null,
        archivePassword: row.archivePassword ?? null,
        sourcePath: itemRecord.sourcePath,
        sourceSize: row.sourceTotalSize ?? null,
        archiveSize: row.archiveSize ?? null,
        resourceCount: Math.max(1, Number(row.resourceCount ?? 1)),
        status: row.status ?? null,
        archivedAt: row.archivedAt ?? null,
        title: String(row.packageTitle ?? row.title ?? '').trim() || '未命名归档包',
        categoryId: itemRecord.categoryId,
        categoryName: itemRecord.categoryName,
        categoryEmoji: itemRecord.categoryEmoji,
        categoryColor: itemRecord.categoryColor,
        items: [itemRecord]
      })
    }

    return Array.from(packageMap.values())
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
      where: and(...conditions),
      with: {
        softwareMeta: true
      }
    })
  }

  static async getResourceDetailById(resourceId: string) {
    await this.ensureResourceTopAndHomePinSchema()
    await this.ensureMediaSubSchema()

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
