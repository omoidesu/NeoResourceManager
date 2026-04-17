import {integer, primaryKey, real, sqliteTable, text} from 'drizzle-orm/sqlite-core';
import {relations, sql} from 'drizzle-orm';
import { ResourceLaunchMode } from '../../common/constants'

// --- 1. 基础配置与分类 ---

export const category = sqliteTable('category', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  emoji: text('emoji'),
  referenceId: text('reference_id'),
  sort: integer('sort'),
  isDeleted: integer('is_deleted', {mode: 'boolean'}).default(false),
});

// --- 2. 核心资源表 ---

export const resource = sqliteTable('resource', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  categoryId: text('category_id').notNull().references(() => category.id),
  coverPath: text('cover_path'),
  description: text('description'),
  basePath: text('base_path').notNull(),
  fileName: text('fileName'),
  ifFavorite: integer('if_favorite', {mode: 'boolean'}).default(false),
  isCompleted: integer('is_completed', {mode: 'boolean'}).default(false),
  rating: real('rating').default(-1),
  size: integer('size'),
  missingStatus: integer('missing_status', {mode: 'boolean'}).default(false),
  isR18: integer('r18', {mode: 'boolean'}).default(false),
  createTime: integer('create_time', {mode: 'timestamp'}).default(sql`(strftime('%s', 'now'))`),
  isDeleted: integer('is_deleted', {mode: 'boolean'}).default(false),
});

// --- 3. 统计信息 ---

export const resourceStat = sqliteTable('resource_stat', {
  resourceId: text('resource_id').primaryKey().references(() => resource.id),
  firstAccessTime: integer('first_access_time', {mode: 'timestamp'}),
  lastAccessTime: integer('last_access_time', {mode: 'timestamp'}),
  accessCount: integer('access_count').default(0),
  totalRuntime: integer('total_runtime').default(0), // 单位：秒
});

export const resourceLog = sqliteTable('resource_log', {
  resourceId: text('resource_id').references(() => resource.id),
  startTime: integer('start_time', {mode: 'timestamp'}),
  endTime: integer('end_time', {mode: 'timestamp'}),
  duration: integer('duration').default(0),
  pid: integer('pid'),
  launchMode: text('launch_mode').default(ResourceLaunchMode.NORMAL),
  isDeleted: integer('is_deleted', {mode: 'boolean'}).default(false),
})

// --- 4. 扩展表 (Meta Data) ---

export const gameMeta = sqliteTable('game_meta', {
  resourceId: text('resource_id').primaryKey().references(() => resource.id),
  nameZh: text('name_zh'),
  nameEn: text('name_en'),
  nameJp: text('name_jp'),
  nickname: text('nickname'),
  engine: text('engine'),
  version: text('version'),
  language: text('language'),
});

export const softwareMeta = sqliteTable('software_meta', {
  resourceId: text('resource_id').primaryKey().references(() => resource.id),
  version: text('version'),
  commandLineArgs: text('command_line_args'),
});

export const singleImageMeta = sqliteTable('single_image_meta', {
  resourceId: text('resource_id').primaryKey().references(() => resource.id),
  resolution: text('resolution'),
  format: text('format'),
  source: text('source'),
});

export const multiImageMeta = sqliteTable('multi_image_meta', {
  resourceId: text('resource_id').primaryKey().references(() => resource.id),
  pageCount: integer('page_count'),
  translator: text('translator'),
  lastReadPage: integer('last_read_page').default(0),
});

export const videoMeta = sqliteTable('video_meta', {
  resourceId: text('resource_id').primaryKey().references(() => resource.id),
  year: text('year'),
});

export const asmrMeta = sqliteTable('asmr_meta', {
  resourceId: text('resource_id').primaryKey().references(() => resource.id),
  cv: text('cv'),
  scenario: text('scenario'),
  illust: text('illust'),
  duration: integer('duration'),
  lastPlayFile: text('last_play_file'),
  lastPlayTime: integer('last_play_time'),
  language: text('language'),
});

export const audioMeta = sqliteTable('audio_meta', {
  resourceId: text('resource_id').primaryKey().references(() => resource.id),
  artist: text('artist'),
  album: text('album'),
  lyricsPath: text('lyrics_path'),
  duration: integer('duration'),
  lastPlayTime: integer('last_play_time').default(0),
});

export const novelMeta = sqliteTable('novel_meta', {
  resourceId: text('resource_id').primaryKey().references(() => resource.id),
  translator: text('translator'),
  isbn: text('isbn'),
  publisher: text('publisher'),
  year: integer('year').default(-1),
  lastReadPercent: real('last_read_percent').default(0)
});

export const websiteMeta = sqliteTable('website_meta', {
  resourceId: text('resource_id').primaryKey().references(() => resource.id),
  favicon: text('favicon'),
});

// --- 5. 关联与实体表 ---
export const author = sqliteTable('author', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  isDeleted: integer('is_deleted', {mode: 'boolean'}).default(false),
})

export const authorWork = sqliteTable('author_work', {
  authorId: text('author_id').notNull(),
  resourceId: text('resource_id').notNull().references(() => resource.id),
  categoryId: text('category_id').notNull().references(() => category.id),
  isDeleted: integer('is_deleted', {mode: 'boolean'}).default(false),
});

export const storeWork = sqliteTable('store_work', {
  id: integer('id').primaryKey({autoIncrement: true}),
  resourceId: text('resource_id').notNull().references(() => resource.id),
  storeId: text('store_id').notNull().references(() => dictData.id),
  workId: text('work_id'),
  url: text('url').notNull(),
  isDeleted: integer('is_deleted', {mode: 'boolean'}).default(false),
});

export const actor = sqliteTable('actor', {
  id: integer('id').primaryKey({autoIncrement: true}),
  resourceId: text('resource_id').notNull().references(() => resource.id),
  name: text('name').notNull(),
  isDeleted: integer('is_deleted', {mode: 'boolean'}).default(false),
});

export const tag = sqliteTable('tag', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  categoryId: text('category_id').notNull().references(() => category.id),
  isDeleted: integer('is_deleted', {mode: 'boolean'}).default(false),
})

export const tagResource = sqliteTable('tag_resource', {
  resourceId: text('resource_id').notNull().references(() => resource.id),
  tagId: text('tag_id').notNull().references(() => tag.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.resourceId, t.tagId] }),
}));

export const resourceType = sqliteTable('resource_type', {
  id: text('id').notNull().primaryKey(),
  name: text('name').notNull(),
  categoryId: text('category_id').notNull().references(() => category.id),
  isDeleted: integer('is_deleted', {mode: 'boolean'}).default(false),
})

export const typeResource = sqliteTable('type_resource', {
  resourceId: text('resource_id').notNull().references(() => resource.id),
  typeId: text('type_id').notNull().references(() => resourceType.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.resourceId, t.typeId] }),
}));

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  value: text('value').notNull(),
  locked: integer('locked', {mode: 'boolean'}).default(false),
  isDeleted: integer('is_deleted', {mode: 'boolean'}).default(false),
});

export const dictType = sqliteTable('dict_type', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  isDeleted: integer('is_deleted', {mode: 'boolean'}).default(false),
})

export const dictData = sqliteTable('dict_data', {
  id: text('id').primaryKey(),
  typeId: text('type_id').notNull().references(() => dictType.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  value: text('value').notNull(),
  extra: text('extra', {mode: 'json'}).$type<{
    extendTable?: string;
    resourcePathType?: string | null;
    extensions?: string[];
    addFirst?: string;
    authorText?: string;
    startText?: string;
    enableFetchInfo?: boolean;
    rule?: object;
    icon?: string;
    url?: object;
    mtool?: boolean;
  }>(),
  isDeleted: integer('is_deleted', {mode: 'boolean'}).default(false),
});

// --- 6. 定义 Relations (用于便捷查询) ---

export const resourceRelations = relations(resource, ({one, many}) => ({
  category: one(category, {fields: [resource.categoryId], references: [category.id]}),
  stats: one(resourceStat, {fields: [resource.id], references: [resourceStat.resourceId]}),
  logs: many(resourceLog),
  // 扩展表关联
  gameMeta: one(gameMeta, {fields: [resource.id], references: [gameMeta.resourceId]}),
  softwareMeta: one(softwareMeta, {fields: [resource.id], references: [softwareMeta.resourceId]}),
  singleImageMeta: one(singleImageMeta, {fields: [resource.id], references: [singleImageMeta.resourceId]}),
  multiImageMeta: one(multiImageMeta, {fields: [resource.id], references: [multiImageMeta.resourceId]}),
  videoMeta: one(videoMeta, {fields: [resource.id], references: [videoMeta.resourceId]}),
  asmrMeta: one(asmrMeta, {fields: [resource.id], references: [asmrMeta.resourceId]}),
  audioMeta: one(audioMeta, {fields: [resource.id], references: [audioMeta.resourceId]}),
  novelMeta: one(novelMeta, {fields: [resource.id], references: [novelMeta.resourceId]}),
  // 列表关联
  actors: many(actor),
  authors: many(authorWork),
  stores: many(storeWork),
  tags: many(tagResource),
  types: many(typeResource),
}));

export const actorRelations = relations(actor, ({one}) => ({
  resource: one(resource, {fields: [actor.resourceId], references: [resource.id]}),
}));

export const resourceStatRelations = relations(resourceStat, ({one}) => ({
  resource: one(resource, {fields: [resourceStat.resourceId], references: [resource.id]}),
}));

export const resourceLogRelations = relations(resourceLog, ({one}) => ({
  resource: one(resource, {fields: [resourceLog.resourceId], references: [resource.id]}),
}));

export const tagResourceRelations = relations(tagResource, ({one}) => ({
  resource: one(resource, {fields: [tagResource.resourceId], references: [resource.id]}),
  tag: one(tag, {fields: [tagResource.tagId], references: [tag.id]}),
}));

export const typeResourceRelations = relations(typeResource, ({one}) => ({
  resource: one(resource, {fields: [typeResource.resourceId], references: [resource.id]}),
  type: one(resourceType, {fields: [typeResource.typeId], references: [resourceType.id]}),
}));

export const dictTypeRelations = relations(dictType, ({many}) => ({
  data: many(dictData),
}));

export const categoryRelations = relations(category, ({one}) => ({
  meta: one(dictData, {fields: [category.referenceId], references: [dictData.id]})
}))

export const authorWorkRelations = relations(authorWork, ({one}) => ({
  author: one(author, {fields: [authorWork.authorId], references: [author.id]}),
  resource: one(resource, {fields: [authorWork.resourceId], references: [resource.id]}),
}));

export const storeWorkRelations = relations(storeWork, ({one}) => ({
  resource: one(resource, {fields: [storeWork.resourceId], references: [resource.id]}),
  store: one(dictData, {fields: [storeWork.storeId], references: [dictData.id]}),
}));
