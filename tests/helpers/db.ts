import { execSync } from "child_process";
import { Pool } from "pg";
import { createPool } from "../../src/db/client";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/hashtag_tracker_test";

let testPool: Pool | null = null;

export function getTestPool(): Pool {
  if (!testPool) {
    throw new Error("Test pool not initialized");
  }
  return testPool;
}

export async function initTestPool(): Promise<Pool> {
  if (!testPool) {
    testPool = createPool(TEST_DATABASE_URL);
  }
  return testPool;
}

export async function truncateTestTables(): Promise<void> {
  const pool = getTestPool();
  await pool.query(
    "TRUNCATE TABLE sync_runs, media, hashtags RESTART IDENTITY CASCADE"
  );
}

export async function closeTestPool(): Promise<void> {
  if (testPool) {
    await testPool.end();
    testPool = null;
  }
}

export function runMigrations(databaseUrl: string = TEST_DATABASE_URL): void {
  execSync("npx node-pg-migrate up -m src/db/migrations", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}
