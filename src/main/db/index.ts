import {drizzle} from 'drizzle-orm/better-sqlite3';
import {migrate} from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {app} from 'electron';
import * as schema from './schema'
import { createLogger } from '../util/logger';

const logger = createLogger('db')

// 确保数据库文件存在于用户数据目录，防止打包后找不到
const dbPath = app.isPackaged
  ? path.join(app.getPath('userData'), 'data.db')
  : 'data.db';

const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, {
  schema,
  // logger: true
});

type ReconcileMigrationRule = {
  tag: string
  table: string
  columns: Array<{
    name: string
    type: string
  }>
}

type IdempotentColumnMigrationRule = ReconcileMigrationRule

const RECONCILE_MIGRATION_RULES: ReconcileMigrationRule[] = [
  {
    tag: '0005_add_asmr_meta_creaters',
    table: 'asmr_meta',
    columns: [
      { name: 'scenario', type: 'text' },
      { name: 'illust', type: 'text' }
    ]
  },
  {
    tag: '0006_add_asmr_meta_duration',
    table: 'asmr_meta',
    columns: [
      { name: 'duration', type: 'integer' }
    ]
  },
  {
    tag: '0007_add_asmr_playback_progress',
    table: 'asmr_meta',
    columns: [
      { name: 'last_play_file', type: 'text' },
      { name: 'last_play_time', type: 'integer' }
    ]
  },
  {
    tag: '0009_add_audio_meta_lyrics_path',
    table: 'audio_meta',
    columns: [
      { name: 'lyrics_path', type: 'text' }
    ]
  },
  {
    tag: '0010_add_novel_reading_progress',
    table: 'novel_meta',
    columns: [
      { name: 'last_read_percent', type: 'real DEFAULT 0' },
      { name: 'isbn', type: 'text' }
    ]
  },
  {
    tag: '0012_add_video_sub_table',
    table: 'video_sub',
    columns: [
      { name: 'id', type: 'text' },
      { name: 'resource_id', type: 'text' },
      { name: 'file_name', type: 'text' },
      { name: 'relative_path', type: 'text' },
      { name: 'sort_order', type: 'integer DEFAULT 0' },
      { name: 'is_visible', type: 'integer DEFAULT 1' },
      { name: 'cover_path', type: 'text' }
    ]
  },
  {
    tag: '0013_add_website_meta_url',
    table: 'website_meta',
    columns: [
      { name: 'url', type: 'text' }
    ]
  },
  {
    tag: '0014_add_website_meta_is_download_link',
    table: 'website_meta',
    columns: [
      { name: 'is_download_link', type: 'integer DEFAULT 0' }
    ]
  }
]

const IDEMPOTENT_COLUMN_MIGRATION_RULES: IdempotentColumnMigrationRule[] = [
  {
    tag: '0015_add_category_pill_color',
    table: 'category',
    columns: [
      { name: 'pill_color', type: 'text' }
    ]
  },
  {
    tag: '0016_replace_video_sub_with_media_sub',
    table: 'media_sub',
    columns: [
      { name: 'kind', type: 'text NOT NULL DEFAULT \'video\'' },
      { name: 'has_subtitle', type: 'integer DEFAULT 0' },
      { name: 'duration', type: 'integer' },
      { name: 'bitrate', type: 'integer' },
      { name: 'sample_rate', type: 'integer' },
      { name: 'frame_rate', type: 'real' },
      { name: 'audio_bitrate', type: 'integer' },
      { name: 'audio_sample_rate', type: 'integer' },
      { name: 'width', type: 'integer' },
      { name: 'height', type: 'integer' },
      { name: 'metadata_updated_at', type: 'integer' }
    ]
  },
  {
    tag: '0018_add_resource_search_text',
    table: 'resource',
    columns: [
      { name: 'search_text', type: 'text' }
    ]
  }
]

function ensureMigrationsTable() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    )
  `)
}

function getTableColumns(tableName: string): Set<string> {
  const rows = sqlite.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string }>
  return new Set(rows.map((row) => row.name))
}

function hasTable(tableName: string) {
  const row = sqlite
    .prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1')
    .get('table', tableName)

  return Boolean(row)
}

function addMissingColumn(tableName: string, columnName: string, columnType: string) {
  sqlite.exec(`ALTER TABLE "${tableName}" ADD "${columnName}" ${columnType}`)
}

function markMigrationApplied(hash: string, createdAt: number) {
  sqlite
    .prepare('INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)')
    .run(hash, createdAt)
}

function isMigrationApplied(createdAt: number) {
  const row = sqlite
    .prepare('SELECT 1 FROM "__drizzle_migrations" WHERE "created_at" = ? LIMIT 1')
    .get(createdAt)

  return Boolean(row)
}

function getMigrationSqlHash(migrationsPath: string, tag: string) {
  const migrationSqlPath = path.join(migrationsPath, `${tag}.sql`)
  if (!fs.existsSync(migrationSqlPath)) {
    logger.warn('skip migration hash because migration file is missing', {
      migration: tag,
      migrationSqlPath
    })
    return ''
  }

  const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8')
  return crypto.createHash('sha256').update(migrationSql).digest('hex')
}

function reconcileSchemaMigrations(migrationsPath: string) {
  ensureMigrationsTable()

  const journalPath = path.join(migrationsPath, 'meta', '_journal.json')
  if (!fs.existsSync(journalPath)) {
    return
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ tag: string; when: number }>
  }

  const appliedRows = sqlite
    .prepare('SELECT created_at FROM "__drizzle_migrations"')
    .all() as Array<{ created_at: number | null }>
  const appliedCreatedAt = new Set(
    appliedRows
      .map((row) => Number(row.created_at))
      .filter((value) => Number.isFinite(value))
  )

  for (const rule of RECONCILE_MIGRATION_RULES) {
    const journalEntry = journal.entries.find((entry) => entry.tag === rule.tag)
    if (!journalEntry || appliedCreatedAt.has(journalEntry.when)) {
      continue
    }

    const existingColumns = getTableColumns(rule.table)
    const presentColumns = rule.columns.filter((column) => existingColumns.has(column.name))

    if (presentColumns.length === 0) {
      continue
    }

    const missingColumns = rule.columns.filter((column) => !existingColumns.has(column.name))
    for (const column of missingColumns) {
      addMissingColumn(rule.table, column.name, column.type)
      logger.warn('reconciled missing legacy column before migration', {
        table: rule.table,
        column: column.name,
        migration: rule.tag
      })
    }

    const hash = getMigrationSqlHash(migrationsPath, rule.tag)
    if (!hash) {
      continue
    }

    markMigrationApplied(hash, journalEntry.when)
    appliedCreatedAt.add(journalEntry.when)

    logger.warn('marked migration as applied after schema reconciliation', {
      migration: rule.tag,
      table: rule.table,
      columns: rule.columns.map((column) => column.name)
    })
  }
}

function applyIdempotentColumnMigrations(migrationsPath: string) {
  ensureMigrationsTable()

  const journalPath = path.join(migrationsPath, 'meta', '_journal.json')
  if (!fs.existsSync(journalPath)) {
    return
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ tag: string; when: number }>
  }

  for (const rule of IDEMPOTENT_COLUMN_MIGRATION_RULES) {
    const journalEntry = journal.entries.find((entry) => entry.tag === rule.tag)
    if (!journalEntry || isMigrationApplied(journalEntry.when)) {
      continue
    }

    if (!hasTable(rule.table)) {
      logger.warn('skip idempotent column migration because table does not exist yet', {
        table: rule.table,
        migration: rule.tag
      })
      continue
    }

    const existingColumns = getTableColumns(rule.table)
    for (const column of rule.columns) {
      if (existingColumns.has(column.name)) {
        continue
      }

      addMissingColumn(rule.table, column.name, column.type)
      logger.warn('added missing column through idempotent migration guard', {
        table: rule.table,
        column: column.name,
        migration: rule.tag
      })
    }

    const hash = getMigrationSqlHash(migrationsPath, rule.tag)
    if (!hash) {
      continue
    }

    markMigrationApplied(hash, journalEntry.when)
    logger.warn('marked idempotent column migration as applied', {
      migration: rule.tag,
      table: rule.table,
      columns: rule.columns.map((column) => column.name)
    })
  }
}

function createMediaSubTableIfMissing() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "media_sub" (
      "id" text PRIMARY KEY NOT NULL,
      "resource_id" text NOT NULL,
      "file_name" text NOT NULL,
      "relative_path" text NOT NULL,
      "kind" text NOT NULL DEFAULT 'video',
      "cover_path" text,
      "sort_order" integer DEFAULT 0,
      "is_visible" integer DEFAULT 1,
      "has_subtitle" integer DEFAULT 0,
      "duration" integer,
      "bitrate" integer,
      "sample_rate" integer,
      "frame_rate" real,
      "audio_bitrate" integer,
      "audio_sample_rate" integer,
      "width" integer,
      "height" integer,
      "metadata_updated_at" integer,
      FOREIGN KEY ("resource_id") REFERENCES "resource"("id") ON UPDATE no action ON DELETE no action
    )
  `)
}

function backfillMediaSubFromVideoSub() {
  if (!hasTable('video_sub')) {
    return
  }

  sqlite.exec(`
    INSERT OR IGNORE INTO "media_sub" (
      "id",
      "resource_id",
      "file_name",
      "relative_path",
      "kind",
      "cover_path",
      "sort_order",
      "is_visible",
      "has_subtitle",
      "duration",
      "bitrate",
      "sample_rate",
      "frame_rate",
      "audio_bitrate",
      "audio_sample_rate",
      "width",
      "height",
      "metadata_updated_at"
    )
    SELECT
      "id",
      "resource_id",
      "file_name",
      "relative_path",
      'video',
      "cover_path",
      COALESCE("sort_order", 0),
      COALESCE("is_visible", 1),
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
    FROM "video_sub"
  `)
}

function reconcileMediaSubMigration(migrationsPath: string) {
  ensureMigrationsTable()

  const journalPath = path.join(migrationsPath, 'meta', '_journal.json')
  if (!fs.existsSync(journalPath)) {
    return
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ tag: string; when: number }>
  }

  const journalEntry = journal.entries.find((entry) => entry.tag === '0016_replace_video_sub_with_media_sub')
  if (!journalEntry || isMigrationApplied(journalEntry.when)) {
    return
  }

  const hasMediaSub = hasTable('media_sub')
  const hasVideoSub = hasTable('video_sub')
  if (!hasMediaSub && !hasVideoSub) {
    return
  }

  createMediaSubTableIfMissing()
  backfillMediaSubFromVideoSub()

  const hash = getMigrationSqlHash(migrationsPath, journalEntry.tag)
  if (!hash) {
    return
  }

  markMigrationApplied(hash, journalEntry.when)
  logger.warn('reconciled media_sub migration for upgraded database', {
    migration: journalEntry.tag,
    createdMediaSub: !hasMediaSub,
    migratedFromVideoSub: hasVideoSub
  })
}

// 执行自动迁移
export const migrateDb = async () => {
  // 这里的 path 要指向你 generate 出来的 drizzle 文件夹
  const migrationsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'drizzle')
    : path.resolve(__dirname, '../../drizzle');

  logger.info('running migrations from', { migrationsPath });
  logger.info('migration path exists', { exists: fs.existsSync(migrationsPath) })

  try {
    reconcileMediaSubMigration(migrationsPath)
    reconcileSchemaMigrations(migrationsPath)
    applyIdempotentColumnMigrations(migrationsPath)
    migrate(db, {migrationsFolder: migrationsPath});
    logger.info('migrations completed successfully')
  } catch (err) {
    logger.error('migrations failed', err);
  }
};
