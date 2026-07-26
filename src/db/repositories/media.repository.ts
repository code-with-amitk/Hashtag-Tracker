import { Pool } from "pg";
import {
  CreateMediaInput,
  Media,
  MediaUpsertResult,
  PaginatedMediaResult,
} from "../../types";
import { mapMediaRow } from "./mappers";
import { decodeMediaCursor, encodeMediaCursor } from "./pagination";

export class MediaRepository {
  constructor(private readonly pool: Pool) {}

  async findByInstagramId(instagramMediaId: string): Promise<Media | null> {
    const result = await this.pool.query(
      `SELECT id, instagram_media_id, hashtag_id, media_type, caption, permalink,
              media_url, stored_asset_path, like_count, comments_count,
              instagram_timestamp, source, created_at, updated_at
       FROM media
       WHERE instagram_media_id = $1`,
      [instagramMediaId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapMediaRow(result.rows[0]);
  }

  async upsert(input: CreateMediaInput): Promise<MediaUpsertResult> {
    const result = await this.pool.query(
      `INSERT INTO media (
         instagram_media_id, hashtag_id, media_type, caption, permalink,
         media_url, like_count, comments_count, instagram_timestamp, source
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (instagram_media_id) DO UPDATE
       SET like_count = EXCLUDED.like_count,
           comments_count = EXCLUDED.comments_count,
           updated_at = NOW()
       RETURNING id, instagram_media_id, hashtag_id, media_type, caption, permalink,
                 media_url, stored_asset_path, like_count, comments_count,
                 instagram_timestamp, source, created_at, updated_at,
                 (xmax = 0) AS inserted`,
      [
        input.instagramMediaId,
        input.hashtagId,
        input.mediaType,
        input.caption,
        input.permalink,
        input.mediaUrl,
        input.likeCount,
        input.commentsCount,
        input.instagramTimestamp,
        input.source,
      ]
    );

    const row = result.rows[0];

    return {
      media: mapMediaRow(row),
      inserted: Boolean(row.inserted),
    };
  }

  async updateStoredAssetPath(id: string, storedAssetPath: string): Promise<Media> {
    const result = await this.pool.query(
      `UPDATE media
       SET stored_asset_path = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, instagram_media_id, hashtag_id, media_type, caption, permalink,
                 media_url, stored_asset_path, like_count, comments_count,
                 instagram_timestamp, source, created_at, updated_at`,
      [id, storedAssetPath]
    );

    if (result.rowCount === 0) {
      throw new Error(`Media not found: ${id}`);
    }

    return mapMediaRow(result.rows[0]);
  }

  async findPaginated(options: {
    hashtagId: string;
    limit: number;
    cursor?: string;
  }): Promise<PaginatedMediaResult> {
    const limit = Math.max(1, options.limit);
    const params: unknown[] = [options.hashtagId];
    let cursorClause = "";

    if (options.cursor) {
      const decoded = decodeMediaCursor(options.cursor);
      params.push(decoded.createdAt, decoded.id);
      cursorClause = `AND (created_at, id) < ($2::timestamptz, $3::uuid)`;
    }

    params.push(limit + 1);
    const limitParamIndex = params.length;

    const result = await this.pool.query(
      `SELECT id, instagram_media_id, hashtag_id, media_type, caption, permalink,
              media_url, stored_asset_path, like_count, comments_count,
              instagram_timestamp, source, created_at, updated_at
       FROM media
       WHERE hashtag_id = $1
       ${cursorClause}
       ORDER BY created_at DESC, id DESC
       LIMIT $${limitParamIndex}`,
      params
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const items = rows.map(mapMediaRow);

    const lastItem = items.at(-1);
    const nextCursor =
      hasMore && lastItem
        ? encodeMediaCursor({
            createdAt: lastItem.createdAt.toISOString(),
            id: lastItem.id,
          })
        : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }
}
