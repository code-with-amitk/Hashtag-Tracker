import { Pool, PoolConfig } from "pg";

let pool: Pool | null = null;

export function createPool(connectionString: string, config: Partial<PoolConfig> = {}): Pool {
  return new Pool({
    connectionString,
    max: config.max ?? 10,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 30_000,
    ...config,
  });
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error("Database pool not initialized. Call initPool() first.");
  }
  return pool;
}

export function initPool(connectionString: string, config?: Partial<PoolConfig>): Pool {
  if (pool) {
    return pool;
  }
  pool = createPool(connectionString, config);
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function checkConnection(activePool: Pool = getPool()): Promise<void> {
  await activePool.query("SELECT 1");
}
