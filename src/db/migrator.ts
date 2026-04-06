import type Database from 'better-sqlite3';
import { dbConfig } from './config.js';
import { migrations } from './migrations.js';
import type { MigrationRecord } from './types.js';

function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${dbConfig.migrationsTable} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function getAppliedMigrations(db: Database.Database): MigrationRecord[] {
  ensureMigrationsTable(db);
  return db
    .prepare(`SELECT version, name, applied_at FROM ${dbConfig.migrationsTable} ORDER BY version ASC`)
    .all() as MigrationRecord[];
}

export function runMigrations(db: Database.Database): MigrationRecord[] {
  ensureMigrationsTable(db);

  const appliedVersions = new Set(
    (db.prepare(`SELECT version FROM ${dbConfig.migrationsTable}`).all() as Array<{ version: number }>).map(
      ({ version }) => version,
    ),
  );

  const insertMigration = db.prepare(
    `INSERT INTO ${dbConfig.migrationsTable} (version, name) VALUES (@version, @name)`,
  );

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;

    const applyMigration = db.transaction(() => {
      db.exec(migration.sql);
      insertMigration.run({ version: migration.version, name: migration.name });
    });

    applyMigration();
  }

  return getAppliedMigrations(db);
}
