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

function addMissingColumn(tableName: string, columnName: string, columnType: string) {
  sqlite.exec(`ALTER TABLE "${tableName}" ADD "${columnName}" ${columnType}`)
}

function markMigrationApplied(hash: string, createdAt: number) {
  sqlite
    .prepare('INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)')
    .run(hash, createdAt)
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

    const migrationSqlPath = path.join(migrationsPath, `${rule.tag}.sql`)
    if (!fs.existsSync(migrationSqlPath)) {
      logger.warn('skip reconciliation because migration file is missing', {
        migration: rule.tag,
        migrationSqlPath
      })
      continue
    }

    const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8')
    const hash = crypto.createHash('sha256').update(migrationSql).digest('hex')
    markMigrationApplied(hash, journalEntry.when)
    appliedCreatedAt.add(journalEntry.when)

    logger.warn('marked migration as applied after schema reconciliation', {
      migration: rule.tag,
      table: rule.table,
      columns: rule.columns.map((column) => column.name)
    })
  }
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
    reconcileSchemaMigrations(migrationsPath)
    migrate(db, {migrationsFolder: migrationsPath});
    logger.info('migrations completed successfully')
  } catch (err) {
    logger.error('migrations failed', err);
  }
};
