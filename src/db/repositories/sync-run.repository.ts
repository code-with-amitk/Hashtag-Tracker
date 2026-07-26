import { Pool } from "pg";
import { SyncCounterDeltas, SyncRun, SyncStatus, SyncType } from "../../types";
import { mapSyncRunRow } from "./mappers";

const SYNC_RUN_COLUMNS = `
  id, hashtag_id, sync_type, status, items_fetched, items_inserted,
  items_skipped, items_failed, error_message, started_at, completed_at, created_at
`;

export class SyncRunRepository {
  constructor(private readonly pool: Pool) {}

  async create(hashtagId: string, syncType: SyncType): Promise<SyncRun> {
    const result = await this.pool.query(
      `INSERT INTO sync_runs (hashtag_id, sync_type, status)
       VALUES ($1, $2, 'pending')
       RETURNING ${SYNC_RUN_COLUMNS}`,
      [hashtagId, syncType]
    );

    return mapSyncRunRow(result.rows[0]);
  }

  async findById(id: string): Promise<SyncRun | null> {
    const result = await this.pool.query(
      `SELECT ${SYNC_RUN_COLUMNS}
       FROM sync_runs
       WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapSyncRunRow(result.rows[0]);
  }

  async updateStatus(
    id: string,
    status: SyncStatus,
    errorMessage?: string | null
  ): Promise<SyncRun> {
    const result = await this.pool.query(
      `UPDATE sync_runs
       SET status = $2,
           error_message = $3
       WHERE id = $1
       RETURNING ${SYNC_RUN_COLUMNS}`,
      [id, status, errorMessage ?? null]
    );

    if (result.rowCount === 0) {
      throw new Error(`Sync run not found: ${id}`);
    }

    return mapSyncRunRow(result.rows[0]);
  }

  async markStarted(id: string): Promise<SyncRun> {
    const result = await this.pool.query(
      `UPDATE sync_runs
       SET status = 'running',
           started_at = COALESCE(started_at, NOW())
       WHERE id = $1
       RETURNING ${SYNC_RUN_COLUMNS}`,
      [id]
    );

    if (result.rowCount === 0) {
      throw new Error(`Sync run not found: ${id}`);
    }

    return mapSyncRunRow(result.rows[0]);
  }

  async markCompleted(id: string): Promise<SyncRun> {
    const result = await this.pool.query(
      `UPDATE sync_runs
       SET status = 'completed',
           completed_at = NOW()
       WHERE id = $1
       RETURNING ${SYNC_RUN_COLUMNS}`,
      [id]
    );

    if (result.rowCount === 0) {
      throw new Error(`Sync run not found: ${id}`);
    }

    return mapSyncRunRow(result.rows[0]);
  }

  async markFailed(id: string, errorMessage: string): Promise<SyncRun> {
    const result = await this.pool.query(
      `UPDATE sync_runs
       SET status = 'failed',
           error_message = $2,
           completed_at = NOW()
       WHERE id = $1
       RETURNING ${SYNC_RUN_COLUMNS}`,
      [id, errorMessage]
    );

    if (result.rowCount === 0) {
      throw new Error(`Sync run not found: ${id}`);
    }

    return mapSyncRunRow(result.rows[0]);
  }

  async incrementCounters(
    id: string,
    deltas: SyncCounterDeltas
  ): Promise<SyncRun> {
    const result = await this.pool.query(
      `UPDATE sync_runs
       SET items_fetched = items_fetched + $2,
           items_inserted = items_inserted + $3,
           items_skipped = items_skipped + $4,
           items_failed = items_failed + $5
       WHERE id = $1
       RETURNING ${SYNC_RUN_COLUMNS}`,
      [
        id,
        deltas.fetched ?? 0,
        deltas.inserted ?? 0,
        deltas.skipped ?? 0,
        deltas.failed ?? 0,
      ]
    );

    if (result.rowCount === 0) {
      throw new Error(`Sync run not found: ${id}`);
    }

    return mapSyncRunRow(result.rows[0]);
  }
}
