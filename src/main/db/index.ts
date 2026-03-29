import {drizzle} from 'drizzle-orm/better-sqlite3';
import {migrate} from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
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

// 执行自动迁移
export const migrateDb = async () => {
  // 这里的 path 要指向你 generate 出来的 drizzle 文件夹
  const migrationsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'drizzle')
    : path.resolve(__dirname, '../../drizzle');

  logger.info('running migrations from', { migrationsPath });
  logger.info('migration path exists', { exists: fs.existsSync(migrationsPath) })

  try {
    migrate(db, {migrationsFolder: migrationsPath});
    logger.info('migrations completed successfully')
  } catch (err) {
    logger.error('migrations failed', err);
  }
};
