import fs from 'node:fs';
import Database from 'better-sqlite3';
import { dbConfig, resolveDbPath } from './config.js';
import { runMigrations } from './migrator.js';

export type OpenDatabaseOptions = {
  migrate?: boolean;
  readonly?: boolean;
  fileMustExist?: boolean;
};

export function openDatabase(options: OpenDatabaseOptions = {}): Database.Database {
  const { migrate = false, readonly = false, fileMustExist = false } = options;

  fs.mkdirSync(dbConfig.dataDir, { recursive: true });

  const db = new Database(resolveDbPath(), { readonly, fileMustExist });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');

  if (migrate && !readonly) {
    runMigrations(db);
  }

  return db;
}
