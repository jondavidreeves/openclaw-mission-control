import path from 'node:path';

const defaultDataDir = path.resolve(process.cwd(), 'data');

export const dbConfig = {
  dataDir: process.env.MISSION_CONTROL_DATA_DIR ?? defaultDataDir,
  filename: process.env.MISSION_CONTROL_DB_FILE ?? 'mission-control.sqlite',
  migrationsTable: '_migrations',
};

export function resolveDbPath(): string {
  return path.join(dbConfig.dataDir, dbConfig.filename);
}
